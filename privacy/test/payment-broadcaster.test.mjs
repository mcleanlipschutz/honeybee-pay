import test from 'node:test';
import assert from 'node:assert/strict';
import { WakuBroadcasterClient, BroadcasterTransaction } from '@railgun-community/waku-broadcaster-client-node';
import { openPaymentBroadcaster, selectQuotedBroadcaster } from '../src/payment-broadcaster.mjs';
import { feeWETH } from '../../shared/test-assets.mjs';
import { testNetwork } from '../src/network-preflight.mjs';
import { paymentFixture, hash } from './payment-fixture.mjs';
import { paymentFailureReason } from '../src/payment-diagnostic.mjs';

// The SDK's signed-fee search boundary is doubled; no network, proofs or send.
const offer = (id, expiration = Date.now() + 600000) => ({
  railgunAddress: 'fixture-broadcaster', tokenAddress: feeWETH.token,
  tokenFee: { feesID: id, feePerUnitGas: '1000000000000000000', expiration,
    availableWallets: 1, relayAdapt: testNetwork('Ethereum_Sepolia').relayAdaptContract },
});

test('rotated offer IDs retain the exact fee recipient, token and numeric rate', () => {
  const now = Date.now(), expected = offer('old-id', now + 120000);
  const fresh = offer('new-id', now + 180000);
  fresh.tokenFee.feePerUnitGas = '0xde0b6b3a7640000';
  const before = structuredClone([expected, fresh]);
  assert.equal([fresh].find(b => b.tokenFee.feesID === expected.tokenFee.feesID), undefined);
  assert.equal(selectQuotedBroadcaster([fresh], expected, now), fresh);
  assert.deepEqual([expected, fresh], before);
  for (const mutate of [
    b => { b.railgunAddress = 'another-broadcaster'; },
    b => { b.tokenAddress = '0x' + '11'.repeat(20); },
    b => { b.tokenFee.feePerUnitGas = '1000000000000000001'; },
    b => { b.tokenFee.feePerUnitGas = '999999999999999999'; },
    b => { b.tokenFee.feePerUnitGas = 'not-a-rate'; },
    b => { b.tokenFee.feePerUnitGas = '0'; },
    b => { b.tokenFee.expiration = now + 30000; },
    b => { b.tokenFee.expiration = now - 1; },
    b => { b.tokenFee.expiration = '9999999999999'; },
    b => { b.tokenFee.feesID = ''; },
  ]) {
    const bad = structuredClone(fresh); mutate(bad);
    assert.equal(selectQuotedBroadcaster([bad], expected, now), undefined);
  }
  assert.equal(selectQuotedBroadcaster([null, {}], expected, now), undefined);
  assert.equal(selectQuotedBroadcaster([fresh], { ...expected, tokenAddress: 'wrong-token' }, now), undefined);
});

test('reconnection and pre-send renewal use current same-rate SDK offers without altering the transaction', async t => {
  const expected = offer('quote-id'), original = structuredClone(expected);
  let offers = [offer('reconnected-id')], stopped = 0, checks = 0;
  const creates = [];
  t.mock.method(WakuBroadcasterClient, 'start', async (_chain, options, status) => {
    assert.deepEqual(options, { enableHealthcheckLogs: false }); status(null, 'Connected');
  });
  t.mock.method(WakuBroadcasterClient, 'stop', async () => { stopped++; });
  t.mock.method(WakuBroadcasterClient, 'findBestBroadcaster', () => { throw Error('Must retain quoted broadcaster'); });
  t.mock.method(WakuBroadcasterClient, 'findBroadcastersForToken', (chain, token, relay) => {
    assert.equal(chain.id, 11155111); assert.equal(token, feeWETH.token); assert.equal(relay, true);
    return offers;
  });
  t.mock.method(BroadcasterTransaction, 'create', async (...args) => {
    creates.push(args); return { send() { throw Error('Test must not send'); } };
  });
  const connection = await openPaymentBroadcaster(() => { checks++; }, expected, () => { throw Error('Observer failure'); });
  try {
    assert.equal(connection.selected.tokenFee.feesID, 'reconnected-id');
    // Returned metadata cannot change the captured fee recipient/rate.
    connection.selected.railgunAddress = 'edited';
    connection.selected.tokenFee.feePerUnitGas = '999';
    offers = [offer('latest-id')];
    const populated = { transaction: { to: testNetwork('Ethereum_Sepolia').relayAdaptContract, data: '0x1234' },
      nullifiers: ['fixture-nullifier'], preTransactionPOIsPerTxidLeafPerList: { fixture: true } };
    await connection.create(populated, 123n);
    assert.equal(creates.length, 1);
    assert.equal(creates[0][1], populated.transaction.to); assert.equal(creates[0][2], populated.transaction.data);
    assert.equal(creates[0][3], original.railgunAddress); assert.equal(creates[0][4], 'latest-id');
    assert.deepEqual(creates[0][6], populated.nullifiers); assert.equal(creates[0][7], 123n);
    assert.equal(creates[0][8], true); assert.deepEqual(creates[0][9], populated.preTransactionPOIsPerTxidLeafPerList);
    assert.deepEqual(expected, original); assert.ok(checks >= 2);
    offers[0].tokenFee.feePerUnitGas = '1000000000000000001';
    await assert.rejects(connection.create(populated, 123n), /Quoted broadcaster fee unavailable/);
    offers = [];
    await assert.rejects(connection.create(populated, 123n), /Quoted broadcaster fee unavailable/);
    assert.equal(creates.length, 1);
  } finally { await connection.close(); }
  assert.equal(stopped, 1);
  assert.equal(paymentFailureReason(new Error('Quoted broadcaster fee unavailable')), 'BROADCASTER_QUOTE_UNAVAILABLE');
});

test('broadcaster startup retains its 90-second deadline', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1700000000000 });
  t.mock.method(WakuBroadcasterClient, 'start', () => new Promise(() => {}));
  let stopped = 0;
  t.mock.method(WakuBroadcasterClient, 'stop', async () => { stopped++; });
  const pending = openPaymentBroadcaster(() => {}, offer('original'));
  const rejected = assert.rejects(pending, /Private payment broadcaster unavailable/);
  t.mock.timers.tick(90000);
  await rejected;
  assert.equal(stopped, 1);
});

test('original quote expiry during reconnection stops before proof generation and leaves the quote unsubmitted', async t => {
  const f = await paymentFixture(t), quoted = (await f.run('payment-quote')).privatePayment;
  const before = structuredClone(quoted.quote);
  await assert.rejects(f.run('payment-submit', { quoteId: quoted.quote.quoteId,
    openBroadcaster: async check => {
      t.mock.method(Date, 'now', () => before.expiresAt);
      check();
      throw Error('An expired quote must never reach a broadcaster');
    } }), /Private payment quote expired or changed/);
  assert.equal(f.state.proofs, 0); assert.equal(f.state.sends, 0);
  const record = (await f.store.read()).payments[0];
  assert.equal(record.status, 'quoted'); assert.deepEqual(record.quote, before);
});

test('confirmation with a renewed offer preserves the reviewed quote and persists the original attempt before sending', async t => {
  const f = await paymentFixture(t), quoted = (await f.run('payment-quote')).privatePayment;
  const fresh = structuredClone(f.selected); fresh.tokenFee.feesID = 'renewed-transport-id';
  fresh.tokenFee.expiration += 10000;
  t.mock.method(WakuBroadcasterClient, 'start', async () => {});
  t.mock.method(WakuBroadcasterClient, 'stop', async () => {});
  t.mock.method(WakuBroadcasterClient, 'findBroadcastersForToken', () => [fresh]);
  t.mock.method(BroadcasterTransaction, 'create', async (...args) => {
    assert.equal(args[3], quoted.quote.broadcasterAddress);
    assert.equal(args[4], fresh.tokenFee.feesID);
    assert.equal(args[7], BigInt(quoted.quote.minGasPriceWei));
    return { send: async () => {
      const saved = (await f.store.read()).payments[0];
      assert.equal(saved.status, 'unknown'); assert.deepEqual(saved.quote, quoted.quote);
      assert.equal(saved.populated.transaction.data, f.state.populated.transaction.data);
      f.state.sends++; return hash;
    } };
  });
  const result = await f.run('payment-submit', { quoteId: quoted.quote.quoteId, openBroadcaster: openPaymentBroadcaster });
  assert.deepEqual(result.privatePayment.quote, quoted.quote);
  assert.equal(result.privatePayment.status, 'pending'); assert.equal(result.privatePayment.hash, hash);
  assert.equal(f.state.proofs, 1); assert.equal(f.state.sends, 1);
  assert.equal(f.state.proofArgs[8].amount, BigInt(quoted.quote.feeUnits));
  await assert.rejects(f.run('payment-submit', { quoteId: quoted.quote.quoteId }), /unfinished/);
  assert.equal(f.state.sends, 1);
});
