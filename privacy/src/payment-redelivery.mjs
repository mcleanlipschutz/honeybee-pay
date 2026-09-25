import { randomBytes } from 'node:crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
import { validatePrivateRequest } from '../../shared/private-request.mjs';
import { validateRedeliveryReview } from '../../shared/payment-redelivery-review.mjs';
import { invoiceValidation } from './account-invoice.mjs';
import { feeWETH } from '../../shared/test-assets.mjs';
import { decodePrivatePaymentBatch, verifyPreparedPayment, paymentHash,
  paymentNeedsCompatibilityProof, validateCompatiblePayment } from './payment-verification.mjs';
import { selectQuotedBroadcaster } from './payment-broadcaster.mjs';
import { paymentFailureReason } from './payment-diagnostic.mjs';

const hash = text => keccak256(toUtf8Bytes(text));
const payloadDigest = record => hash(JSON.stringify({ quote: record.quote, gas: record.gas,
  broadcaster: record.broadcaster, populated: record.populated, compatiblePopulated: record.compatiblePopulated }));

// The caller holds the account filesystem lease for this entire operation.
// Read-only status/history never enter this branch. A legacy relay payload may
// get ONE compatible proof, checked against both original tree/nullifier pairs.
// The original payload remains immutable and either authorization can settle.
export async function operatePaymentRedelivery({ action, reviewId, record, data, store,
  prepared, session, checkSession, openBroadcaster, prepareCompatible, report }) {
  if (!['payment-redelivery-review', 'payment-redelivery-submit'].includes(action)) throw new Error('Original payment is not eligible for delivery retry');
  const quote = record.quote;
  const checkOriginal = () => {
    checkSession();
    validatePrivateRequest(quote.request, invoiceValidation());
    if (quote.version !== 2 || record.status !== 'unknown' || record.hash || record.candidateHash
        || data.payments.some(p => p !== record && ['unknown', 'pending', 'reverted'].includes(p.status))
        || record.broadcaster?.railgunAddress !== quote.broadcasterAddress
        || record.broadcaster?.tokenAddress?.toLowerCase() !== feeWETH.token.toLowerCase()
        || decodePrivatePaymentBatch(record.populated?.transaction, record.populated?.nullifiers, quote.minGasPriceWei).length !== 2) {
      throw new Error('Original payment is not eligible for delivery retry');
    }
  };
  report('redelivery-review', 'IN_PROGRESS');
  checkOriginal();
  const compatibleRequired = paymentNeedsCompatibilityProof(record.populated);
  const deliveryKind = compatibleRequired ? 'compatible-proof' : 'original-payload';
  const selectedPayload = () => compatibleRequired ? validateCompatiblePayment(record) : record.populated;
  let review;
  const check = () => {
    checkOriginal();
    if (review) {
      validateRedeliveryReview(review, { quote, hash });
      if (review.deliveryKind !== deliveryKind || review.payloadDigest !== payloadDigest(record)) throw new Error('Original delivery review expired or changed');
      selectedPayload();
    }
  };
  if (action === 'payment-redelivery-submit') {
    review = record.deliveryReview;
    if (!review || review.reviewId !== reviewId || record.deliveryReviewUsed) throw new Error('Original delivery review expired or changed');
    check();
    // One use even if the process stops during preflight. A duplicate HTTP
    // request cannot redeliver; another attempt requires a new visible review.
    record.deliveryReviewUsed = true;
    await store.write(data);
  } else {
    delete record.deliveryReview; delete record.deliveryReviewUsed;
    await store.write(data);
  }
  report('broadcaster', 'IN_PROGRESS');
  const broadcaster = await openBroadcaster(check, record.broadcaster);
  try {
    check();
    if (!selectQuotedBroadcaster([broadcaster.selected], record.broadcaster)) throw new Error('Quoted broadcaster fee unavailable');
    report('proof-verification', 'IN_PROGRESS');
    const verify = async populated => {
      check();
      if (BigInt(await prepared.rpc('eth_chainId', [])) !== 11155111n) throw new Error('Wrong receipt network');
      const deployment = await prepared.inspect(2);
      const feeBlock = await prepared.rpc('eth_getBlockByNumber', [deployment.blockNumber, false]);
      if (feeBlock?.hash !== deployment.blockHash || BigInt(feeBlock.baseFeePerGas) >= BigInt(quote.minGasPriceWei)) {
        throw new Error('Original payment network fee is no longer sufficient');
      }
      await verifyPreparedPayment({ ...populated, minGas: quote.minGasPriceWei,
        rpc: prepared.rpc, deployment, checkSession: check });
      check();
      return deployment;
    };
    // Check original unspent inputs before any expensive recovery proof work.
    await verify(record.populated);
    if (action === 'payment-redelivery-review' && compatibleRequired && !record.compatiblePopulated) {
      const generated = await prepareCompatible(check);
      check();
      // Never allow an SDK-selected different input, even if balances and the
      // merchant amount happen to match. Do not persist an invalid alternative.
      validateCompatiblePayment({ ...record, compatiblePopulated: generated });
      await verify(generated);
      record.compatiblePopulated = generated;
      await store.write(data);
      report('compatibility-check', 'ORIGINAL_NOTES_MATCHED');
    }
    await verify(selectedPayload());
    if (action === 'payment-redelivery-review') {
      // Proving can outlive the offer observed when this worker started.
      const current = broadcaster.currentOffer ? broadcaster.currentOffer() : broadcaster.selected;
      if (!selectQuotedBroadcaster([current], record.broadcaster)) throw new Error('Quoted broadcaster fee unavailable');
      const createdAt = Date.now();
      const body = { version: 2, purpose: 'original-private-payment-recovery', deliveryKind, quoteId: quote.quoteId,
        payloadDigest: payloadDigest(record), nonce: '0x' + randomBytes(32).toString('hex'), createdAt,
        expiresAt: Math.min(createdAt + 300000, quote.request.expiresAt * 1000, session.expiresAt, current.tokenFee.expiration) };
      review = validateRedeliveryReview({ ...body, reviewId: hash(JSON.stringify(body)) }, { quote, hash });
      record.deliveryReview = review; record.deliveryReviewUsed = false;
      await store.write(data);
      report('redelivery-review', 'ORIGINAL_DELIVERY_REVIEW_READY');
      return { deliveryReview: review };
    }
    // Submit cannot generate or modify any proof. It sends precisely the
    // payload named by the fresh review, preserving the old authorization too.
    const send = await broadcaster.create(structuredClone(selectedPayload()), BigInt(quote.minGasPriceWei));
    // Transport creation can take time. Recheck the chain after it completes.
    await verify(selectedPayload());
    check();
    record.deliveryDiagnostic = 'ORIGINAL_DELIVERY_STARTED';
    if (compatibleRequired) record.compatibleDeliveryAuthorized = true;
    await store.write(data);
    report('broadcast', 'ORIGINAL_DELIVERY_STARTED');
    try {
      check();
      record.candidateHash = paymentHash(await send.send()); record.status = 'pending';
      record.deliveryDiagnostic = 'BROADCAST_ACK_RECEIVED';
    } catch (error) { record.deliveryDiagnostic = paymentFailureReason(error); }
    await store.write(data, { retainOutcome: true });
    report('broadcast', record.deliveryDiagnostic);
    report('payment-outcome', record.status.toUpperCase());
    return {};
  } finally { await broadcaster.close(); }
}
