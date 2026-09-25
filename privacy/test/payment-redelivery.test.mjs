import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentFixture, hash, word } from './payment-fixture.mjs';
import { createPaymentStore } from '../src/payment-store.mjs';
import { createAccountWalletClient } from '../../checkout/src/account-client.mjs';

const original = async t => {
  const f = await paymentFixture(t);
  const quote = (await f.run('payment-quote')).privatePayment.quote;
  f.state.sendFailure = true;
  await f.run('payment-submit', { quoteId: quote.quoteId });
  const fields = { quoteId: quote.quoteId };
  const review = async extra => f.run('payment-redelivery-review', { ...fields, ...extra });
  const retry = (r, extra) => f.run('payment-redelivery-submit', { ...fields, reviewId: r.reviewId, ...extra });
  return Object.assign(f, { quote, fields, review, retry });
};
const transport = (f, capture, beforeCreate = () => {}) => async check => ({
  selected: f.selected, close: async () => {},
  create: async (populated, minGas) => {
    check(); await beforeCreate();
    capture.push({ populated: structuredClone(populated), minGas });
    return { send: async () => { f.state.sends++; return hash; } };
  },
});

test('an expired quote can only redeliver through fresh consent, retaining every original payload field and fee', async t => {
  const f = await original(t), saved = (await f.store.read()).payments[0], capture = [];
  const now = f.quote.expiresAt + 1;
  t.mock.method(Date, 'now', () => now);
  f.selected.tokenFee.expiration = now + 600000;
  await assert.rejects(f.run('payment-submit', f.fields));
  await assert.rejects(f.run('payment-quote'));
  await assert.rejects(f.retry({ reviewId: word('ff') }));
  const result = await f.review(), r = result.deliveryReview;
  assert.equal(result.privatePayment.status, 'unknown');
  assert.equal(f.state.sends, 1); assert.equal(f.state.proofs, 1);
  assert.equal(r.quoteId, f.quote.quoteId); assert.ok(r.expiresAt > now);
  assert.equal((await f.run('payment-history')).privatePayments[0].deliveryReview, undefined);
  const sent = await f.retry(r, { openBroadcaster: transport(f, capture) });
  assert.equal(sent.privatePayment.status, 'pending'); assert.equal(sent.privatePayment.hashVerified, false);
  assert.equal(f.state.sends, 2); assert.equal(f.state.proofs, 1);
  assert.deepEqual(capture, [{ populated: saved.populated, minGas: BigInt(f.quote.minGasPriceWei) }]);
  const after = (await f.store.read()).payments[0];
  for (const key of ['quote', 'gas', 'broadcaster', 'populated']) assert.deepEqual(after[key], saved[key]);
  assert.equal(after.deliveryReviewUsed, true);
  await assert.rejects(f.retry(r)); assert.equal(f.state.sends, 2);
});

test('a lost retry response keeps the same unknown payment and consumes consent; status and history never resend', async t => {
  const f = await original(t), r = (await f.review()).deliveryReview;
  f.state.sendError = Error('Request timed out.');
  const retry = await f.retry(r);
  assert.equal(retry.privatePayment.status, 'unknown'); assert.equal(f.state.sends, 2);
  await assert.rejects(f.retry(r), /review expired or changed/);
  await f.run('payment-history'); await f.run('payment-status', f.fields);
  assert.equal(f.state.sends, 2); assert.equal(f.state.proofs, 1);
  assert.equal((await f.store.read()).payments[0].deliveryDiagnostic, 'BROADCAST_RESPONSE_TIMEOUT');
  assert.notEqual((await f.review()).deliveryReview.reviewId, r.reviewId);
});

test('replaced, expired, altered or cross-wallet consent cannot send', async t => {
  for (const mode of ['replaced', 'expired', 'payload', 'quote', 'wallet', 'session']) {
    const f = await original(t), r = (await f.review()).deliveryReview;
    if (mode === 'replaced') await f.review();
    if (['expired', 'payload', 'quote'].includes(mode)) {
      const data = await f.store.read();
      if (mode === 'expired') data.payments[0].deliveryReview.expiresAt = 1;
      if (mode === 'payload') data.payments[0].populated.preTransactionPOIsPerTxidLeafPerList = { changed: true };
      if (mode === 'quote') data.payments[0].quote.feeUnits = '12345';
      await f.store.write(data);
    }
    if (mode === 'session') f.session.expiresAt = 1;
    await assert.rejects(f.retry(r, mode === 'wallet' ? { wallet: { ...f.wallet, id: 'other-wallet' } } : {}));
    assert.equal(f.state.sends, 1); assert.equal(f.state.proofs, 1);
  }
});

test('spent notes, changed fee terms, changed chain and failed proofs block review and delivery', async t => {
  for (const mode of ['spent', 'proof', 'chain', 'broadcaster', 'known-hash']) {
    const f = await original(t), r = (await f.review()).deliveryReview;
    if (mode === 'spent') f.state.nullifierSpent = true;
    if (mode === 'proof') f.state.acceptProof = false;
    if (mode === 'chain') f.state.wrongChain = true;
    if (mode === 'broadcaster') f.selected.tokenFee.feePerUnitGas = '0x2';
    if (mode === 'known-hash') { const d = await f.store.read(); d.payments[0].candidateHash = hash; await f.store.write(d); }
    await assert.rejects(f.retry(r)); await assert.rejects(f.review());
    assert.equal(f.state.sends, 1);
  }
});

test('settlement while transport is prepared is detected before retry delivery', async t => {
  const f = await original(t), r = (await f.review()).deliveryReview, capture = [];
  await assert.rejects(f.retry(r, { openBroadcaster: transport(f, capture, () => { f.state.nullifierSpent = true; }) }), /already spent/);
  assert.equal(capture.length, 1); assert.equal(f.state.sends, 1);
  assert.equal((await f.store.read()).payments[0].deliveryReviewUsed, true);
});

test('request expiry and network fee increases do not create replacements or extend original authorization', async t => {
  const f = await original(t), r = (await f.review()).deliveryReview;
  const rpc = async (method, params) => {
    const value = await f.rpc(method, params);
    return method === 'eth_getBlockByNumber' ? { ...value, baseFeePerGas: '0xffffffffff' } : value;
  };
  await assert.rejects(f.retry(r, { prepared: { rpc, inspect: async () => ({ blockNumber: '0x123', blockHash: word('bb') }) } }), /network fee/);
  const now = f.request.expiresAt * 1000 + 1;
  t.mock.method(Date, 'now', () => now);
  f.session.expiresAt = now + 3600000;
  await assert.rejects(f.review()); assert.equal(f.state.sends, 1);
});

test('late retry ACK is encrypted and durable even after the account session expires', async t => {
  const f = await original(t), r = (await f.review()).deliveryReview;
  f.state.sendFailure = false;
  f.state.beforeSend = async () => { f.session.expiresAt = 1; };
  await f.retry(r);
  const reopened = createPaymentStore({ directory: f.directory, privateKey: f.privateKey, ownerId: f.session.ownerId, checkSession() {} });
  const saved = (await reopened.read()).payments[0];
  assert.equal(saved.candidateHash, hash); assert.equal(saved.status, 'pending'); assert.equal(saved.deliveryReviewUsed, true);
  assert.equal(f.state.sends, 2); assert.equal(f.state.proofs, 1);
});

test('browser client accepts only a fresh delivery review bound to the displayed original payment and wallet', async t => {
  const f = await original(t);
  const wallet = { id: f.wallet.id, privateAddress: f.wallet.railgunAddress, status: 'locked' };
  let mutate = () => {}, calls = 0;
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'test-only-token',
    fetchImpl: async (_url, options) => {
      calls++; assert.equal(JSON.parse(options.body).action, 'payment-redelivery-review');
      const value = { ...await f.review(), account: { authenticated: true }, network: 'Ethereum_Sepolia',
        privateWallet: wallet, paymentReady: false, identityVerification: { verified: false, status: 'deferred-for-testnet' } };
      mutate(value);
      return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    } });
  const run = () => client.privatePayment('payment-redelivery-review', { password: 'test-only-password', ...f.fields }, wallet, f.quote);
  assert.equal((await run()).deliveryReview.quoteId, f.quote.quoteId);
  for (const edit of [v => { v.deliveryReview.quoteId = word('ef'); }, v => { v.deliveryReview.expiresAt = 1; },
    v => { v.privatePayment.status = 'pending'; v.privatePayment.hash = hash; }, v => { v.privateWallet = { ...wallet, id: 'other-wallet' }; },
    v => { v.deliveryReview.extra = true; }]) {
    mutate = edit; await assert.rejects(run(), /could not be prepared/);
  }
  assert.equal(calls, 6); assert.equal(f.state.sends, 1);
});
