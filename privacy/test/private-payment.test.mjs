import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { paymentFixture, hash, word } from './payment-fixture.mjs';
import { paymentMemo } from '../src/account-private-payment.mjs';
import { createPaymentStore } from '../src/payment-store.mjs';
import { validatePaymentSummary } from '../../checkout/src/private-payment.mjs';
import { checkMerchantReceipts } from '../src/merchant-receipts.mjs';

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
  for (const mutate of [f => { f.state.balance = 1000000n; }, f => { f.state.scanComplete = false; }, f => { f.state.fee = 100001n; }]) {
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
  const result = await f.run('payment-status', { quoteId: q.quoteId });
  assert.equal(result.privatePayment.status, 'confirmed'); assert.equal(result.privatePayment.hash, hash);
  assert.equal(f.state.sends, 1);
  validatePaymentSummary(result.privatePayment, { id: f.wallet.id, privateAddress: f.wallet.railgunAddress });
  await assert.rejects(f.run('payment-quote'), /already has/);
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
