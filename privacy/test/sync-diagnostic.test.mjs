import test from 'node:test';
import assert from 'node:assert/strict';
import { syncDiagnosticStages, syncFailureDiagnostic } from '../src/sync-diagnostic.mjs';

test('sync diagnostics cannot include exception text, credentials or additional fields', () => {
  for (const input of ['https://example.test?password=secret', 'history-scan\nsecret',
    { stage: 'history-scan', password: 'secret' }, ['TIMEOUT'], null, undefined]) {
    const diagnostic = syncFailureDiagnostic(input, input);
    assert.deepEqual(diagnostic, { stage: 'worker-start', reason: 'CHECK_FAILED' });
    assert.equal(Object.isFrozen(diagnostic), true);
  }
  for (const stage of syncDiagnosticStages) {
    assert.deepEqual(syncFailureDiagnostic(stage, 'TIMEOUT'), { stage, reason: 'TIMEOUT' });
  }
  assert.deepEqual(syncFailureDiagnostic('poi-service', 'ENOTFOUND'), { stage: 'poi-service', reason: 'ENOTFOUND' });
  assert.deepEqual(syncFailureDiagnostic('history-scan', new Error('password=secret')),
    { stage: 'history-scan', reason: 'CHECK_FAILED' });
});
