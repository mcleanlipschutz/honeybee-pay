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
import { decodePrivatePayment, verifyPreparedPayment, verifyPrivatePaymentReceipt, paymentHash } from './payment-verification.mjs';

const version = TXIDVersion.V2_PoseidonMerkle;
const digest = value => keccak256(toUtf8Bytes(JSON.stringify(value)));
export const paymentMemo = request => `hb:v1:${request.id}:${request.digest}`;
export function paymentFeeLimit(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,6}$/.test(value) || BigInt(value) > 1000000n) {
    throw new Error('Choose a broadcaster fee limit above zero and at most 1 test USDC');
  }
  return BigInt(value);
}
export function validatePaymentQuote(value, { wallet, now = Date.now(), allowExpired = false } = {}) {
  const { quoteId, ...body } = structuredClone(value);
  const request = validatePrivateRequest(body.request, invoiceValidation(allowExpired ? body.request.createdAt : Math.floor(now / 1000)));
  const maximum = paymentFeeLimit(body.maxFeeUnits);
  validatePrivateRecipient(body.broadcasterAddress);
  if (quoteId !== digest(body) || body.version !== 1 || body.network !== accountSyncNetwork
      || body.chainId !== 11155111 || body.walletId !== wallet.id || body.privateAddress !== wallet.railgunAddress
      || !/^[1-9][0-9]{0,6}$/.test(body.feeUnits) || BigInt(body.feeUnits) > maximum
      || body.totalUnits !== (BigInt(request.amountUnits) + BigInt(body.feeUnits)).toString()
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
    checkSession(); return result;
  };
  await inspect(3);
  return { ...prepared, artifacts, rpc, inspect };
}

export async function operatePrivatePayment({ action, paymentRequest, maxFeeUnits, quoteId, hash,
  sdk, wallet, key, privateKey, directory, session, prepared, checkSession, signal, onStage = () => {},
  openBroadcaster = openPaymentBroadcaster }) {
  const store = createPaymentStore({ directory, privateKey, ownerId: session.ownerId, checkSession });
  const data = await store.read();
  checkSession();
  if (action === 'payment-history') return { privatePayments: data.payments.map(summary) };
  if (action === 'payment-status') {
    const record = data.payments.find(p => p.quote.quoteId === quoteId);
    if (!record) throw new Error('Private payment attempt unavailable');
    validatePaymentQuote(record.quote, { wallet, allowExpired: true });
    if (record.status === 'quoted') return { privatePayment: summary(record) };
    // Refresh sent commitments and finish protocol POI proofs before checking
    // settlement. This never generates or broadcasts another payment.
    await scanAccountWallet({ sdk, wallet, prepared, checkSession, signal, onStage });
    const completed = await sdk.getCompletedTxidFromNullifiers(version, testNetwork(accountSyncNetwork).chain, record.populated.nullifiers);
    const candidates = [...new Set([completed?.txid, record.hash, hash, record.candidateHash].filter(Boolean).map(paymentHash))];
    let receipt;
    for (const candidate of candidates) {
      try {
        const checked = await verifyPrivatePaymentReceipt({ record, hash: candidate, rpc: prepared.rpc, checkSession });
        if (checked.status !== 'unknown') { receipt = checked; break; }
      } catch { checkSession(); /* An ACK or manual hash is not settlement evidence. */ }
    }
    receipt ||= { status: 'unknown', hash: record.hash || null };
    // Recheck canonical settlement even for a previously confirmed record.
    Object.assign(record, { status: receipt.status, hash: receipt.hash, receipt });
    await store.write(data);
    return { privatePayment: summary(record) };
  }
  // An outer Ethereum revert does not consume the private nullifier or revoke
  // the delivered proof. Keep that authorization unresolved: a broadcaster may
  // still execute it later, including after the request's offchain expiry.
  if (data.payments.some(p => ['unknown', 'pending', 'reverted'].includes(p.status))) throw new Error('Check the unfinished private payment before another attempt');
  let record;
  if (action === 'payment-submit') {
    record = data.payments.find(p => p.quote.quoteId === quoteId);
    if (!record || record.status !== 'quoted') throw new Error('This private payment was already attempted or its quote is unavailable');
    validatePaymentQuote(record.quote, { wallet });
    paymentRequest = record.quote.request;
  } else {
    paymentRequest = validatePrivateRequest(paymentRequest, invoiceValidation()); paymentFeeLimit(maxFeeUnits);
    if (data.payments.some(p => p.quote.request.id === paymentRequest.id && p.status !== 'quoted')) throw new Error('This request already has a payment attempt');
    if (data.payments.filter(p => p.status !== 'quoted').length >= 16) throw new Error('This test wallet has reached its 16-payment journal limit');
  }
  if (paymentRequest.recipient === wallet.railgunAddress) throw new Error('Choose a separate merchant wallet');
  onStage('history-scan');
  const scanned = await scanAccountWallet({ sdk, wallet, prepared, checkSession, signal, onStage });
  if (BigInt(scanned.spendableBalance.amountUnits) <= BigInt(paymentRequest.amountUnits)) throw new Error('More spendable private test USDC is required for the amount and broadcaster fee');
  checkSession();
  onStage('broadcaster');
  const broadcaster = await openBroadcaster(checkSession, record?.broadcaster);
  try {
    if (action === 'payment-quote') {
      const selected = broadcaster.selected;
      validatePrivateRecipient(selected.railgunAddress);
      const feeRate = selected.tokenFee.feePerUnitGas;
      if (typeof feeRate !== 'string' || !/^(?:[1-9][0-9]{0,29}|0x[a-fA-F0-9]{1,25})$/.test(feeRate)
          || BigInt(feeRate) <= 0n || BigInt(feeRate) > 10n ** 30n
          || selected.tokenAddress.toLowerCase() !== accountSyncToken.toLowerCase()) throw new Error('Invalid broadcaster fee');
      const block = await prepared.rpc('eth_getBlockByNumber', ['latest', false]);
      const priority = BigInt(await prepared.rpc('eth_maxPriorityFeePerGas', []));
      const price = BigInt(block.baseFeePerGas) * 2n + priority;
      if (price <= 0n || price > 50000000000n || priority > price) throw new Error('Network fee exceeds the test limit');
      const evmGasType = getEVMGasTypeForTransaction(accountSyncNetwork, false);
      if (![0, 1, 2].includes(evmGasType)) throw new Error('Unsupported broadcaster gas type');
      let gas = { evmGasType, gasEstimate: 0n, ...([0, 1].includes(evmGasType)
        ? { gasPrice: price } : { maxFeePerGas: price, maxPriorityFeePerGas: priority }) };
      const feeDetails = { tokenAddress: accountSyncToken, feePerUnitGas: BigInt(feeRate) };
      const recipients = [{ tokenAddress: accountSyncToken, amount: BigInt(paymentRequest.amountUnits), recipientAddress: paymentRequest.recipient }];
      onStage('fee-estimate');
      const estimate = await sdk.gasEstimateForUnprovenTransfer(version, accountSyncNetwork, wallet.id, key,
        paymentMemo(paymentRequest), recipients, [], gas, feeDetails, false);
      if (typeof estimate.gasEstimate !== 'bigint' || estimate.gasEstimate < 21000n || estimate.gasEstimate > 2000000n) throw new Error('Invalid private payment gas estimate');
      gas = { ...gas, gasEstimate: estimate.gasEstimate };
      const fee = sdk.calculateBroadcasterFeeERC20Amount(feeDetails, gas).amount;
      if (fee <= 0n || fee > paymentFeeLimit(maxFeeUnits)) throw new Error('Broadcaster fee exceeds your limit');
      const total = BigInt(paymentRequest.amountUnits) + fee;
      if (total > BigInt(scanned.spendableBalance.amountUnits)) throw new Error('Insufficient spendable private funds including the fee');
      checkSession();
      const createdAt = Date.now();
      const body = { version: 1, network: accountSyncNetwork, chainId: 11155111,
        walletId: wallet.id, privateAddress: wallet.railgunAddress, request: paymentRequest,
        maxFeeUnits, feeUnits: fee.toString(), totalUnits: total.toString(),
        broadcasterAddress: selected.railgunAddress, minGasPriceWei: price.toString(), createdAt,
        expiresAt: Math.min(createdAt + 600000, paymentRequest.expiresAt * 1000, session.expiresAt, selected.tokenFee.expiration) };
      const quote = validatePaymentQuote({ ...body, quoteId: digest(body) }, { wallet });
      record = { quote, gas: serializable(gas), broadcaster: selected, status: 'quoted', hash: null };
      data.payments = data.payments.filter(p => p.status !== 'quoted');
      data.payments.push(record); await store.write(data);
      return { privatePayment: summary(record) };
    }
    const quote = validatePaymentQuote(record.quote, { wallet });
    if (BigInt(quote.totalUnits) > BigInt(scanned.spendableBalance.amountUnits)) throw new Error('Private balance changed');
    const recipients = [{ tokenAddress: accountSyncToken, amount: BigInt(quote.request.amountUnits), recipientAddress: quote.request.recipient }];
    const fee = { tokenAddress: accountSyncToken, amount: BigInt(quote.feeUnits), recipientAddress: quote.broadcasterAddress };
    onStage('proof-generation');
    await sdk.generateTransferProof(version, accountSyncNetwork, wallet.id, key, false,
      paymentMemo(quote.request), recipients, [], fee, false, BigInt(quote.minGasPriceWei), () => checkSession());
    checkSession(); validatePaymentQuote(quote, { wallet });
    const populated = await sdk.populateProvedTransfer(version, accountSyncNetwork, wallet.id, false,
      paymentMemo(quote.request), recipients, [], fee, false, BigInt(quote.minGasPriceWei), gasDetails(record.gas));
    const tx = decodePrivatePayment(populated.transaction, populated.nullifiers, quote.minGasPriceWei);
    onStage('proof-verification');
    const deployment = await prepared.inspect(tx.commitments.length);
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
    } catch { /* Delivery may have occurred. Keep the durable unknown state. */ }
    await store.write(data, { retainOutcome: true });
    return { privatePayment: summary(record) };
  } finally { await broadcaster.close(); }
}
