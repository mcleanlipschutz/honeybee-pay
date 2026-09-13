import { readFile } from 'node:fs/promises';
import { keccak256, toUtf8Bytes } from 'ethers';
import { TXIDVersion, getEVMGasTypeForTransaction } from '@railgun-community/shared-models';
import { validatePrivateRequest } from '../../shared/private-request.mjs';
import { invoiceValidation, validatePrivateRecipient } from './account-invoice.mjs';
import { accountSyncNetwork, accountSyncToken, scanAccountWallet } from './account-sync.mjs';
import { inspectDeployment } from './deployment-check.mjs';
import { makeReadOnlyRpc, testNetwork } from './network-preflight.mjs';
import { createTransferArtifactStore } from './transfer-artifacts.mjs';
import { openPaymentBroadcaster } from './payment-broadcaster.mjs';
import { createPaymentStore } from './payment-store.mjs';
import { decodePrivatePaymentBatch, verifyPreparedPayment, verifyPrivatePaymentReceipt, paymentHash } from './payment-verification.mjs';

import { feeWETH } from '../../shared/test-assets.mjs';
import { verifyFeeToken } from './fee-token.mjs';
import { createBoundPaymentProver } from './bound-payment-prover.mjs';
import { inspectOriginalPaymentChain } from './payment-chain-recovery.mjs';
import { paymentFailureDiagnostic, paymentFailureReason } from './payment-diagnostic.mjs';

const version = TXIDVersion.V2_PoseidonMerkle;
const digest = value => keccak256(toUtf8Bytes(JSON.stringify(value)));
export const paymentMemo = request => `hb:v1:${request.id}:${request.digest}`;
export function paymentFeeLimit(value, legacy = false) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,16}$/.test(value) || BigInt(value) > (legacy ? 1000000n : BigInt(feeWETH.maxFeeUnits))) {
    throw new Error('Choose a broadcaster fee limit above zero and at most 0.01 Sepolia WETH');
  }
  return BigInt(value);
}
export function validatePaymentQuote(value, { wallet, now = Date.now(), allowExpired = false } = {}) {
  const { quoteId, ...body } = structuredClone(value);
  const request = validatePrivateRequest(body.request, invoiceValidation(allowExpired ? body.request.createdAt : Math.floor(now / 1000)));
  const maximum = paymentFeeLimit(body.maxFeeUnits, body.version === 1);
  validatePrivateRecipient(body.broadcasterAddress);
  if (quoteId !== digest(body) || ![1, 2].includes(body.version) || body.network !== accountSyncNetwork
      || body.chainId !== 11155111 || body.walletId !== wallet.id || body.privateAddress !== wallet.railgunAddress
      || !/^[1-9][0-9]{0,16}$/.test(body.feeUnits) || BigInt(body.feeUnits) > maximum
      || (body.version === 2 && (body.feeToken !== feeWETH.token || body.feeDecimals !== 18))
      || body.totalUnits !== (BigInt(request.amountUnits) + (body.version === 1 ? BigInt(body.feeUnits) : 0n)).toString()
      || !/^[1-9][0-9]{0,11}$/.test(body.minGasPriceWei) || BigInt(body.minGasPriceWei) > 50000000000n
      || !Number.isSafeInteger(body.createdAt) || body.createdAt > now + 5000
      || !Number.isSafeInteger(body.expiresAt) || body.expiresAt <= body.createdAt
      || body.expiresAt > body.createdAt + 600000 || body.expiresAt > request.expiresAt * 1000
      || (!allowExpired && body.expiresAt <= now)) throw new Error('Private payment quote expired or changed');
  return Object.freeze({ ...body, quoteId });
}
const gasDetails = value => ({ evmGasType: value.evmGasType, gasEstimate: BigInt(value.gasEstimate),
  ...([0, 1].includes(value.evmGasType) ? { gasPrice: BigInt(value.gasPrice) }
    : { maxFeePerGas: BigInt(value.maxFeePerGas), maxPriorityFeePerGas: BigInt(value.maxPriorityFeePerGas) }) });
const serializable = value => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item));
const summary = record => ({ quote: record.quote, status: record.status, hash: record.hash || record.candidateHash || null,
  hashVerified: !!record.hash,
  ...(record.receipt ? { receipt: record.receipt } : {}) });

export async function preparePaymentRuntime(prepared, checkSession) {
  const artifacts = await createTransferArtifactStore();
  // Refuse missing files before recovering a funded wallet into a proof flow.
  for (const circuit of ['01x02', '01x03', 'poi-nov-2-23/POI_3x3']) {
    for (const name of ['wasm', 'zkey', 'vkey.json']) {
      if (!await artifacts.exists(`artifacts-v2.1/${circuit}/${name}`)) throw new Error('Prepare pinned transfer artifacts first');
    }
  }
  const pins = JSON.parse(await readFile(new URL('../config/sepolia-deployment.json', import.meta.url)));
  const rpc = makeReadOnlyRpc(prepared.rpcURL);
  const inspect = async outputs => {
    checkSession();
    const key = JSON.parse(await artifacts.get(`artifacts-v2.1/01x0${outputs}/vkey.json`));
    const result = await inspectDeployment(accountSyncNetwork, rpc, pins, key, { blockTag: 'latest', outputs });
    await verifyFeeToken(rpc, result, checkSession);
    checkSession(); return result;
  };
  await inspect(2);
  return { ...prepared, artifacts, rpc, inspect };
}

export async function operatePrivatePayment({ action, paymentRequest, maxFeeUnits, quoteId, hash,
  sdk, wallet, key, privateKey, directory, session, prepared, checkSession, signal, onStage = () => {},
  openBroadcaster = openPaymentBroadcaster, paymentProver = createBoundPaymentProver() }) {
  const store = createPaymentStore({ directory, privateKey, ownerId: session.ownerId, checkSession });
  onStage('payment-store');
  const data = await store.read();
  const report = (stage, reason) => { try { const d = paymentFailureDiagnostic(stage, reason); onStage(d.stage, d.reason); } catch {} };
  checkSession();
  if (action === 'payment-history') return { privatePayments: data.payments.map(summary) };
  if (action === 'payment-status') {
    const record = data.payments.find(p => p.quote.quoteId === quoteId);
    if (!record) throw new Error('Private payment attempt unavailable');
    validatePaymentQuote(record.quote, { wallet, allowExpired: true });
    if (record.status === 'quoted') return { privatePayment: summary(record) };
    report('broadcast', record.deliveryDiagnostic || 'DELIVERY_REASON_NOT_RECORDED');
    // Refresh sent commitments and finish protocol POI proofs before checking
    // settlement. This never generates or broadcasts another payment.
    await scanAccountWallet({ sdk, wallet, prepared, checkSession, signal, onStage });
    // The SDK searches one input tree at a time. Separate asset proofs can
    // spend different trees; discover each nullifier independently, then
    // require the original complete batch and receipt for every candidate.
    const discovered = [];
    report('transaction-lookup', 'IN_PROGRESS');
    for (const nullifier of record.populated.nullifiers) {
      checkSession();
      try {
        const completed = await sdk.getCompletedTxidFromNullifiers(version, testNetwork(accountSyncNetwork).chain, [nullifier]);
        if (completed?.txid) discovered.push(paymentHash(completed.txid));
      } catch (error) { checkSession(); report('transaction-lookup', paymentFailureReason(error)); }
    }
    const candidates = [...new Set([...discovered, record.hash, hash, record.candidateHash].filter(Boolean).map(paymentHash))];
    report('transaction-lookup', candidates.length ? 'TRANSACTION_CANDIDATE_FOUND' : 'NO_TRANSACTION_CANDIDATE');
    let receipt;
    const checkedCandidates = new Set();
    const inspectCandidates = async values => {
      for (const candidate of values) {
        if (checkedCandidates.has(candidate)) continue;
        checkedCandidates.add(candidate);
        report('receipt-verification', 'IN_PROGRESS');
        try {
          const checked = await verifyPrivatePaymentReceipt({ record, hash: candidate, rpc: prepared.rpc, checkSession });
          if (checked.status !== 'unknown') { receipt = checked; break; }
          report('receipt-verification', 'RECEIPT_UNAVAILABLE');
        } catch { checkSession(); report('receipt-verification', 'RECEIPT_REJECTED'); }
      }
    };
    await inspectCandidates(candidates);
    if (!receipt) {
      try {
        const lookup = await inspectOriginalPaymentChain({ record, rpc: prepared.rpc, checkSession, onStage: report });
        await inspectCandidates(lookup.candidates);
      } catch (error) { checkSession(); report('chain-event-search', paymentFailureReason(error)); }
    }
    receipt ||= { status: 'unknown', hash: record.hash || null };
    // Recheck canonical settlement even for a previously confirmed record.
    Object.assign(record, { status: receipt.status, hash: receipt.hash, receipt });
    await store.write(data);
    report('payment-outcome', record.status.toUpperCase());
    return { privatePayment: summary(record) };
  }
  // An outer Ethereum revert does not consume the private nullifier or revoke
  // the delivered proof. Keep that authorization unresolved: a broadcaster may
  // still execute it later, including after the request's offchain expiry.
  onStage('payment-validation');
  if (data.payments.some(p => ['unknown', 'pending', 'reverted'].includes(p.status))) throw new Error('Check the unfinished private payment before another attempt');
  let record;
  if (action === 'payment-submit') {
    record = data.payments.find(p => p.quote.quoteId === quoteId);
    if (!record || record.status !== 'quoted') throw new Error('This private payment was already attempted or its quote is unavailable');
    validatePaymentQuote(record.quote, { wallet });
    if (record.quote.version !== 2) throw new Error('Get a new quote with the Sepolia WETH fee');
    paymentRequest = record.quote.request;
  } else {
    paymentRequest = validatePrivateRequest(paymentRequest, invoiceValidation()); paymentFeeLimit(maxFeeUnits);
    if (data.payments.some(p => p.quote.request.id === paymentRequest.id && p.status !== 'quoted')) throw new Error('This request already has a payment attempt');
    if (data.payments.filter(p => p.status !== 'quoted').length >= 16) throw new Error('This test wallet has reached its 16-payment journal limit');
  }
  if (paymentRequest.recipient === wallet.railgunAddress) throw new Error('Choose a separate merchant wallet');
  const scanned = await scanAccountWallet({ sdk, wallet, prepared, checkSession, signal, onStage, includeFeeBalance: true });
  onStage('payment-balance');
  if (BigInt(scanned.spendableBalance.amountUnits) < BigInt(paymentRequest.amountUnits)) throw new Error('More spendable private test USDC is required for the merchant amount');
  const feeBalance = BigInt(scanned.spendableFeeBalance.amountUnits);
  if (feeBalance <= 0n) throw new Error('Deposit Sepolia WETH for the private broadcaster fee first');
  checkSession();
  onStage('broadcaster');
  const checkBroadcaster = () => {
    checkSession();
    if (record) validatePaymentQuote(record.quote, { wallet });
  };
  const broadcaster = await openBroadcaster(checkBroadcaster, record?.broadcaster);
  try {
    if (action === 'payment-quote') {
      const selected = broadcaster.selected;
      validatePrivateRecipient(selected.railgunAddress);
      const feeRate = selected.tokenFee.feePerUnitGas;
      if (typeof feeRate !== 'string' || !/^(?:[1-9][0-9]{0,29}|0x[a-fA-F0-9]{1,25})$/.test(feeRate)
          || BigInt(feeRate) <= 0n || BigInt(feeRate) > 10n ** 30n
          || selected.tokenAddress.toLowerCase() !== feeWETH.token.toLowerCase()) throw new Error('Invalid broadcaster fee');
      const block = await prepared.rpc('eth_getBlockByNumber', ['latest', false]);
      const priority = BigInt(await prepared.rpc('eth_maxPriorityFeePerGas', []));
      const price = BigInt(block.baseFeePerGas) * 2n + priority;
      if (price <= 0n || price > 50000000000n || priority > price) throw new Error('Network fee exceeds the test limit');
      const evmGasType = getEVMGasTypeForTransaction(accountSyncNetwork, false);
      if (![0, 1, 2].includes(evmGasType)) throw new Error('Unsupported broadcaster gas type');
      let gas = { evmGasType, gasEstimate: 0n, ...([0, 1].includes(evmGasType)
        ? { gasPrice: price } : { maxFeePerGas: price, maxPriorityFeePerGas: priority }) };
      const feeDetails = { tokenAddress: feeWETH.token, feePerUnitGas: BigInt(feeRate) };
      const recipients = [{ tokenAddress: accountSyncToken, amount: BigInt(paymentRequest.amountUnits), recipientAddress: paymentRequest.recipient }];
      onStage('fee-estimate');
      const estimate = await paymentProver.gasEstimateForUnprovenTransfer(version, accountSyncNetwork, wallet.id, key,
        paymentMemo(paymentRequest), recipients, [], gas, feeDetails, false);
      if (typeof estimate.gasEstimate !== 'bigint' || estimate.gasEstimate < 21000n || estimate.gasEstimate > 2000000n) throw new Error('Invalid private payment gas estimate');
      gas = { ...gas, gasEstimate: estimate.gasEstimate };
      const fee = sdk.calculateBroadcasterFeeERC20Amount(feeDetails, gas).amount;
      if (fee <= 0n || fee > paymentFeeLimit(maxFeeUnits)) throw new Error('Broadcaster fee exceeds your limit');
      const total = BigInt(paymentRequest.amountUnits);
      if (fee > feeBalance) throw new Error('Insufficient spendable private Sepolia WETH for the fee');
      checkSession();
      const createdAt = Date.now();
      const body = { version: 2, feeToken: feeWETH.token, feeDecimals: 18, network: accountSyncNetwork, chainId: 11155111,
        walletId: wallet.id, privateAddress: wallet.railgunAddress, request: paymentRequest,
        maxFeeUnits, feeUnits: fee.toString(), totalUnits: total.toString(),
        broadcasterAddress: selected.railgunAddress, minGasPriceWei: price.toString(), createdAt,
        expiresAt: Math.min(createdAt + 600000, paymentRequest.expiresAt * 1000, session.expiresAt, selected.tokenFee.expiration) };
      onStage('quote-validation');
      const quote = validatePaymentQuote({ ...body, quoteId: digest(body) }, { wallet });
      record = { quote, gas: serializable(gas), broadcaster: selected, status: 'quoted', hash: null };
      data.payments = data.payments.filter(p => p.status !== 'quoted');
      data.payments.push(record); await store.write(data);
      return { privatePayment: summary(record) };
    }
    const quote = validatePaymentQuote(record.quote, { wallet });
    if (BigInt(quote.totalUnits) > BigInt(scanned.spendableBalance.amountUnits) || BigInt(quote.feeUnits) > feeBalance) throw new Error('Private balance changed');
    const recipients = [{ tokenAddress: accountSyncToken, amount: BigInt(quote.request.amountUnits), recipientAddress: quote.request.recipient }];
    const fee = { tokenAddress: feeWETH.token, amount: BigInt(quote.feeUnits), recipientAddress: quote.broadcasterAddress };
    onStage('proof-generation');
    await paymentProver.generateTransferProof(version, accountSyncNetwork, wallet.id, key, false,
      paymentMemo(quote.request), recipients, [], fee, false, BigInt(quote.minGasPriceWei), () => checkSession());
    checkSession(); validatePaymentQuote(quote, { wallet });
    const populated = await paymentProver.populateProvedTransfer(version, accountSyncNetwork, wallet.id, false,
      paymentMemo(quote.request), recipients, [], fee, false, BigInt(quote.minGasPriceWei), gasDetails(record.gas));
    const txs = decodePrivatePaymentBatch(populated.transaction, populated.nullifiers, quote.minGasPriceWei);
    if (txs.length !== 2) throw new Error('Separate fee payment must contain two bound proofs');
    onStage('proof-verification');
    const deployment = await prepared.inspect(2);
    const feeBlock = await prepared.rpc('eth_getBlockByNumber', [deployment.blockNumber, false]);
    if (feeBlock?.hash !== deployment.blockHash || BigInt(feeBlock.baseFeePerGas) >= BigInt(quote.minGasPriceWei)) {
      throw new Error('The network fee changed. Get a new quote before submitting.');
    }
    await verifyPreparedPayment({ ...populated, minGas: quote.minGasPriceWei, rpc: prepared.rpc, deployment, checkSession });
    validatePaymentQuote(quote, { wallet }); checkSession();
    const send = await broadcaster.create(populated, BigInt(quote.minGasPriceWei));
    // Persist the exact proof/nullifiers BEFORE any send, including attempts
    // whose broadcaster response may be lost. A new proof is never auto-retried.
    record.populated = serializable(populated); record.status = 'unknown';
    await store.write(data);
    onStage('broadcast');
    try {
      validatePaymentQuote(quote, { wallet }); checkSession();
      record.candidateHash = paymentHash(await send.send()); record.status = 'pending';
      record.deliveryDiagnostic = 'BROADCAST_ACK_RECEIVED';
    } catch (error) {
      // Delivery may have occurred. Record only a fixed code and keep unknown.
      record.deliveryDiagnostic = paymentFailureReason(error);
    }
    await store.write(data, { retainOutcome: true });
    report('broadcast', record.deliveryDiagnostic);
    report('payment-outcome', record.status.toUpperCase());
    return { privatePayment: summary(record) };
  } finally { await broadcaster.close(); }
}
