import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { paymentFixture, hash, word } from './payment-fixture.mjs';
import { paymentMemo } from '../src/account-private-payment.mjs';
import { createPaymentStore } from '../src/payment-store.mjs';
import { validatePaymentSummary } from '../../checkout/src/private-payment.mjs';
import { checkMerchantReceipts } from '../src/merchant-receipts.mjs';
import { keccak256, toUtf8Bytes } from 'ethers';
import { validatePaymentQuote } from '../src/account-private-payment.mjs';
import { decodePrivatePaymentBatch, bindingHash, paymentProxy } from '../src/payment-verification.mjs';
import { relayInterface, walletInterface } from '../src/deployment-check.mjs';
import { feeWETH } from '../../shared/test-assets.mjs';

test('quote is read-only; explicit confirmation binds recipient, amount, private memo and fee before durable broadcast', async t => {
  const f = await paymentFixture(t);
  const { privatePayment: quoted } = await f.run('payment-quote');
  assert.equal(f.state.proofs, 0); assert.equal(f.state.sends, 0);
  validatePaymentSummary(quoted, { id: f.wallet.id, privateAddress: f.wallet.railgunAddress });
  f.state.beforeSend = async () => {
    const record = (await f.store.read()).payments[0];
    assert.equal(record.status, 'unknown'); assert.equal(record.populated.transaction.data, f.state.populated.transaction.data);
  };
  const result = await f.run('payment-submit', { quoteId: quoted.quote.quoteId });
  assert.equal(result.privatePayment.status, 'pending'); assert.equal(result.privatePayment.hash, hash);
  const args = f.state.proofArgs;
  assert.equal(args[4], false); assert.equal(args[5], paymentMemo(f.request));
  assert.deepEqual(args[6], [{ tokenAddress: f.request.token, amount: 1000000n, recipientAddress: f.request.recipient }]);
  assert.equal(args[8].amount, 10000n); assert.equal(args[8].recipientAddress, f.selected.railgunAddress); assert.equal(args[9], false);
  await assert.rejects(f.run('payment-submit', { quoteId: quoted.quote.quoteId }), /unfinished/);
  assert.equal(f.state.sends, 1);
  const encrypted = await readFile(join(f.directory, 'private-payments.v1.json'), 'utf8');
  assert.equal(encrypted.includes(f.request.recipient), false); assert.equal(encrypted.includes(f.request.id), false);
});

test('unspendable notes, changed expiry, excessive fee, invalid proof, extra outputs and spent nullifiers cannot broadcast', async t => {
  for (const mutate of [f => { f.state.balance = 999999n; }, f => { f.state.scanComplete = false; }, f => { f.state.fee = 100001n; }]) {
    const f = await paymentFixture(t); mutate(f); await assert.rejects(f.run('payment-quote')); assert.equal(f.state.sends, 0);
  }
  for (const mutate of [f => { f.state.acceptProof = false; }, f => { f.state.nullifierSpent = true; },
    f => { f.state.changeProof = tx => { tx.boundParams.unshield = 1; }; },
    f => { f.state.changeProof = tx => { tx.boundParams.chainID = 1; }; },
    f => { f.session.expiresAt = 1; }]) {
    const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
    mutate(f); await assert.rejects(f.run('payment-submit', { quoteId: q.quoteId })); assert.equal(f.state.sends, 0);
  }
});

test('lost broadcaster response survives reload and is reconciled by original nullifiers without a resend', async t => {
  const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
  f.state.sendFailure = true;
  assert.equal((await f.run('payment-submit', { quoteId: q.quoteId })).privatePayment.status, 'unknown');
  await assert.rejects(f.run('payment-quote'), /unfinished/);
  f.mined(); f.state.discoveredHash = hash;
  const lookups = [];
  // Mirrors the pinned Engine's per-tree search: a combined cross-tree lookup
  // cannot resolve, although each proof settled in this same outer transaction.
  f.sdk.getCompletedTxidFromNullifiers = async (_version, _chain, nullifiers) => {
    lookups.push(nullifiers);
    return nullifiers.length === 1 ? { txid: hash } : undefined;
  };
  const result = await f.run('payment-status', { quoteId: q.quoteId });
  assert.deepEqual(lookups, f.state.structs.map(tx => tx.nullifiers));
  assert.notEqual(f.state.structs[0].boundParams.treeNumber, f.state.structs[1].boundParams.treeNumber);
  assert.equal(result.privatePayment.status, 'confirmed'); assert.equal(result.privatePayment.hash, hash);
  assert.equal(f.state.sends, 1);
  validatePaymentSummary(result.privatePayment, { id: f.wallet.id, privateAddress: f.wallet.railgunAddress });
  await assert.rejects(f.run('payment-quote'), /already has/);
});

test('merchant amount and WETH fee have separate units, balance requirements and tamper checks', async t => {
  const f = await paymentFixture(t);
  f.state.balance = 1000000n;
  const quoted = (await f.run('payment-quote')).privatePayment;
  assert.equal(quoted.quote.totalUnits, '1000000');
  assert.equal(quoted.quote.feeToken, feeWETH.token); assert.equal(quoted.quote.feeDecimals, 18);
  for (const patch of [{ feeToken: f.request.token }, { feeDecimals: 6 }, { totalUnits: '1010000' }, { maxFeeUnits: '10000000000000001' }]) {
    const { quoteId: _id, ...body } = { ...quoted.quote, ...patch };
    const quote = { ...body, quoteId: keccak256(toUtf8Bytes(JSON.stringify(body))) };
    assert.throws(() => validatePaymentQuote(quote, { wallet: f.wallet }));
    assert.throws(() => validatePaymentSummary({ ...quoted, quote }, { id: f.wallet.id, privateAddress: f.wallet.railgunAddress }));
  }
  f.state.feeBalance = 9999n;
  await assert.rejects(f.run('payment-submit', { quoteId: quoted.quote.quoteId }), /balance changed/);
  await assert.rejects(f.run('payment-quote'), /Insufficient spendable/);
  f.state.feeBalance = 0n;
  await assert.rejects(f.run('payment-quote'), /Deposit Sepolia WETH/);
  assert.equal(f.state.sends, 0);
});

test('bound relay payload rejects removed or reordered proofs, direct execution, changed actions and duplicate nullifiers', async t => {
  const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
  await f.run('payment-submit', { quoteId: q.quoteId });
  const original = f.state.populated;
  const decode = value => decodePrivatePaymentBatch(value, original.nullifiers, q.minGasPriceWei);
  assert.equal(decode(original.transaction).length, 2);
  for (const edit of [
    (txs) => txs.pop(), (txs) => txs.reverse(),
    (txs) => { txs[1].boundParams.adaptParams = word('00'); },
    (txs) => { txs[1].boundParams.adaptContract = paymentProxy; },
    (_txs, action) => { action.requireSuccess = false; },
    (_txs, action) => { action.minGasLimit = 1n; },
    (_txs, action) => { action.calls = [{ to: paymentProxy, data: '0x', value: 0n }]; },
    (txs, action) => { txs[1].nullifiers = txs[0].nullifiers; for (const tx of txs) tx.boundParams.adaptParams = bindingHash(txs, action); },
    (txs) => { txs[1].commitments.pop(); txs[1].boundParams.commitmentCiphertext.pop(); },
  ]) {
    const [, a] = relayInterface.decodeFunctionData('relay', original.transaction.data);
    const txs = structuredClone(f.state.structs), action = { random: a.random, requireSuccess: a.requireSuccess, minGasLimit: a.minGasLimit, calls: [] };
    edit(txs, action);
    assert.throws(() => decode({ ...original.transaction, data: relayInterface.encodeFunctionData('relay', [txs, action]) }));
  }
  assert.throws(() => decode({ to: paymentProxy, data: walletInterface.encodeFunctionData('transact', [[f.state.structs[0]]]) }));
});

test('a late broadcaster hash remains durable when the authorization expires during delivery', async t => {
  const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
  f.state.beforeSend = async () => { f.session.expiresAt = 1; };
  const result = await f.run('payment-submit', { quoteId: q.quoteId });
  assert.equal(result.privatePayment.hash, hash);
  const reopened = createPaymentStore({ directory: f.directory, privateKey: f.privateKey, ownerId: f.session.ownerId, checkSession() {} });
  assert.equal((await reopened.read()).payments[0].candidateHash, hash);
  assert.equal((await reopened.read()).payments[0].hash, null);
  assert.equal(f.state.sends, 1);
});

test('receipt checks reject wrong chain, altered calldata, missing proof outputs and noncanonical blocks', async t => {
  for (const mutate of [f => { f.state.wrongChain = true; }, f => { f.state.tx.input = '0x'; },
    f => { f.state.receipt.logs.pop(); }, f => { f.state.receipt.logs[0].removed = true; },
    f => { f.state.reorg = true; }, f => { f.state.receipt.logs[1].transactionHash = word('ee'); }]) {
    const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
    await f.run('payment-submit', { quoteId: q.quoteId }); f.mined(); mutate(f);
    const result = await f.run('payment-status', { quoteId: q.quoteId });
    assert.equal(result.privatePayment.status, 'unknown');
    assert.equal((await f.store.read()).payments[0].hash, null);
  }
});

test('an unrelated broadcaster acknowledgement cannot pin a hash or block exact-proof recovery', async t => {
  const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
  f.state.ackHash = word('ee');
  const pending = (await f.run('payment-submit', { quoteId: q.quoteId })).privatePayment;
  assert.equal(pending.hash, word('ee')); assert.equal(pending.hashVerified, false);
  f.mined(); f.state.discoveredHash = hash;
  const verified = (await f.run('payment-status', { quoteId: q.quoteId })).privatePayment;
  assert.equal(verified.status, 'confirmed'); assert.equal(verified.hash, hash); assert.equal(verified.hashVerified, true);
  assert.equal(f.state.sends, 1);
});

test('an outer transaction revert does not release the still-valid private authorization', async t => {
  const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
  await f.run('payment-submit', { quoteId: q.quoteId }); f.mined();
  f.state.receipt.status = '0x0'; f.state.receipt.logs = [];
  assert.equal((await f.run('payment-status', { quoteId: q.quoteId })).privatePayment.status, 'reverted');
  await assert.rejects(f.run('payment-quote'), /unfinished/);
  assert.equal(f.state.sends, 1);
});

test('payment records reject another account, wrong recovery key and ciphertext tampering', async t => {
  const f = await paymentFixture(t); await f.run('payment-quote');
  for (const override of [{ ownerId: '03'.repeat(32) }, { privateKey: '0x' + '04'.repeat(32) }]) {
    const store = createPaymentStore({ directory: f.directory, privateKey: f.privateKey, ownerId: f.session.ownerId, checkSession() {}, ...override });
    await assert.rejects(store.read());
  }
  const path = join(f.directory, 'private-payments.v1.json'), text = JSON.parse(await readFile(path));
  text.data = (text.data[0] === '0' ? '1' : '0') + text.data.slice(1); await writeFile(path, JSON.stringify(text));
  await assert.rejects(f.store.read());
});

test('merchant receipt requires a decrypted exact request memo and amount plus valid POI and canonical settlement', async t => {
  const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
  await f.run('payment-submit', { quoteId: q.quoteId }); f.mined();
  const received = { tokenAddress: f.request.token, amount: 1000000n, memoText: paymentMemo(f.request), hasValidPOIForActiveLists: true, balanceBucket: 'Spendable' };
  let note = received;
  const sdk = { getWalletTransactionHistory: async () => [{ txid: hash, txidVersion: 'V2_PoseidonMerkle', receiveERC20Amounts: [note] }] };
  const run = () => checkMerchantReceipts({ sdk, wallet: { id: 'merchant', railgunAddress: f.request.recipient }, requests: [f.request], rpc: f.rpc, checkSession() {} });
  assert.equal((await run()).receivedPrivatePayments.length, 1);
  for (const patch of [{ amount: 999999n }, { memoText: 'another request' }, { hasValidPOIForActiveLists: false }, { shieldFee: '2500' }, { balanceBucket: 'ShieldPending' }]) {
    note = { ...received, ...patch }; assert.equal((await run()).receivedPrivatePayments.length, 0);
  }
});

test('one unsupported outer payment does not hide a separately verified merchant receipt', async t => {
  const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
  await f.run('payment-submit', { quoteId: q.quoteId }); f.mined();
  const received = { tokenAddress: f.request.token, amount: 1000000n, memoText: paymentMemo(f.request), hasValidPOIForActiveLists: true, balanceBucket: 'Spendable' };
  const sdk = { getWalletTransactionHistory: async () => [word('ee'), hash].map(txid => ({ txid, txidVersion: 'V2_PoseidonMerkle', receiveERC20Amounts: [received] })) };
  const rpc = (method, params) => method === 'eth_getTransactionByHash' && params[0] === word('ee') ? { to: f.state.tx.to, input: '0x12345678' } : f.rpc(method, params);
  const result = await checkMerchantReceipts({ sdk, wallet: { id: 'merchant', railgunAddress: f.request.recipient }, requests: [f.request], rpc, checkSession() {} });
  assert.equal(result.receivedPrivatePayments.length, 1);
});
