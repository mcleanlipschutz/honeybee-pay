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
