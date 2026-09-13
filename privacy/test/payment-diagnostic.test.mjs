import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentDiagnosticStages, paymentFailureDiagnostic, paymentFailureReason } from '../src/payment-diagnostic.mjs';
import { paymentFixture } from './payment-fixture.mjs';

test('payment diagnostics only export fixed labels even for secret-bearing or malformed errors', () => {
  for (const input of ['password=secret', 'history-scan\nsecret', { password: 'secret' }, ['TIMEOUT'], null, undefined]) {
    assert.deepEqual(paymentFailureDiagnostic(input, input), { stage: 'worker-start', reason: 'CHECK_FAILED' });
  }
  for (const stage of paymentDiagnosticStages) {
    const value = paymentFailureDiagnostic(stage, 'TIMEOUT');
    assert.deepEqual(value, { stage, reason: 'TIMEOUT' }); assert.ok(Object.isFrozen(value));
  }
  assert.equal(paymentFailureReason(new Error('password=secret https://rpc.example?key=private')), 'SDK_ERROR');
  assert.equal(paymentFailureReason({ cause: { code: 'ECONNRESET', message: 'private account data' } }), 'ECONNRESET');
  assert.equal(paymentFailureReason({ get message() { throw new Error('secret'); } }), 'SDK_ERROR');
  assert.equal(paymentFailureReason({ name: 'TimeoutError', message: 'sensitive' }), 'TIMEOUT');
  assert.equal(paymentFailureReason({ name: 'AbortError' }), 'CANCELLED');
  assert.equal(paymentFailureReason(new Error('More spendable private test USDC is required for the merchant amount; secret')), 'SDK_ERROR');
});

test('failed real payment-quote logic distinguishes USDC, WETH, incomplete scans and fee limits without sending', async t => {
  const cases = [
    [f => { f.state.balance = 0n; }, 'payment-balance', 'INSUFFICIENT_PRIVATE_USDC'],
    [f => { f.state.feeBalance = 0n; }, 'payment-balance', 'PRIVATE_WETH_REQUIRED'],
    [f => { f.state.scanComplete = false; }, 'utxo-history', 'SCAN_INCOMPLETE'],
    [f => { f.state.fee = 100001n; }, 'fee-estimate', 'FEE_LIMIT_EXCEEDED'],
  ];
  for (const [mutate, expectedStage, expectedReason] of cases) {
    const f = await paymentFixture(t); mutate(f);
    let stage, failure;
    try { await f.run('payment-quote', { onStage: value => { stage = value; } }); }
    catch (error) { failure = paymentFailureDiagnostic(stage, paymentFailureReason(error)); }
    assert.deepEqual(failure, { stage: expectedStage, reason: expectedReason });
    assert.equal(f.state.sends, 0); assert.equal(f.state.proofs, 0);
  }
});

test('the pinned SDK wrapper yields fixed nested broadcaster reasons without exposing response text', () => {
  const cases = [
    ['Could not create valid transaction object.', 'BROADCAST_RELAY_REJECTED'],
    ['Could not validate Proof of Innocence - Broadcaster cannot process this transaction.', 'BROADCAST_POI_REJECTED'],
    ['Bad token fee.', 'BROADCAST_FEE_REJECTED'],
    ['Unknown Broadcaster error.', 'BROADCAST_UNKNOWN_ERROR'],
    ['Broadcaster is out of gas, or currently does not have enough to process this transaction.', 'BROADCAST_OUT_OF_GAS'],
    ['Broadcaster does not support this network.', 'BROADCAST_NETWORK_UNSUPPORTED'],
    ['Transaction has already been sent.', 'BROADCAST_ALREADY_SENT'],
    ['Bad token fee. password=secret', 'BROADCAST_RESPONSE_ERROR'],
    ['secret'.repeat(100000), 'BROADCAST_RESPONSE_ERROR'],
  ];
  for (const [message, reason] of cases) {
    const error = Error('Received response error from broadcaster.', { cause: Error(message) });
    assert.equal(paymentFailureReason(error), reason);
    assert.deepEqual(paymentFailureDiagnostic('broadcast', reason), { stage: 'broadcast', reason });
  }
  assert.equal(paymentFailureReason(Error('unrelated', { cause: Error(cases[0][0]) })), 'SDK_ERROR');
  assert.equal(paymentFailureReason({ message: 'Received response error from broadcaster.', get cause() { throw Error('secret'); } }), 'BROADCAST_RESPONSE_ERROR');
  const cyclic = { message: 'Received response error from broadcaster.' }; cyclic.cause = cyclic;
  assert.equal(paymentFailureReason(cyclic), 'BROADCAST_RESPONSE_ERROR');
});

test('a nested rejection is durably sanitized while payment remains unknown and read-only checks never resend', async t => {
  const f = await paymentFixture(t), quote = (await f.run('payment-quote')).privatePayment.quote;
  f.state.sendFailure = true;
  f.state.sendError = Error('Received response error from broadcaster.', { cause: Error('Unknown Broadcaster error.') });
  await f.run('payment-submit', { quoteId: quote.quoteId });
  const saved = (await f.store.read()).payments[0];
  assert.equal(saved.deliveryDiagnostic, 'BROADCAST_UNKNOWN_ERROR'); assert.equal(saved.status, 'unknown');
  const stages = [];
  await f.run('payment-status', { quoteId: quote.quoteId, onStage: (stage, reason) => stages.push([stage, reason]) });
  assert.ok(stages.some(([s, r]) => s === 'broadcast' && r === 'BROADCAST_UNKNOWN_ERROR'));
  assert.equal(f.state.sends, 1);
});
