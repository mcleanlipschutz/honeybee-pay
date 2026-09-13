import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanTracker } from '../src/sync-state.mjs';
import { syncProviderConfig, syncTimeoutMilliseconds } from '../src/sync-config.mjs';
test('sync timeout is bounded and rejects malformed input', () => {
  assert.equal(syncTimeoutMilliseconds(), 90000);
  assert.equal(syncTimeoutMilliseconds('300'), 300000);
  for (const value of ['0', '601', '-1', '1.5', '', 'Infinity', '300seconds']) assert.throws(() => syncTimeoutMilliseconds(value));
});
import { createFallbackProviderFromJsonConfig } from '@railgun-community/shared-models';
test('sync configuration is accepted by the installed SDK and rejects insecure remote RPCs', async () => {
  const provider = createFallbackProviderFromJsonConfig(syncProviderConfig('https://example.com'));
  await provider.destroy();
  assert.throws(() => syncProviderConfig('http://example.com'));
});
test('both matching-chain scan completions are required and rescans invalidate completion', () => {
  const chain = { type: 0, id: 11155111 };
  const tracker = createScanTracker(chain);
  const event = scanStatus => ({ chain, scanStatus });
  assert.equal(tracker.complete(), false);
  tracker.update('utxo', event('Complete'));
  tracker.update('txid', { chain: { type: 0, id: 1 }, scanStatus: 'Complete' });
  assert.equal(tracker.complete(), false);
  tracker.update('txid', event('Incomplete'));
  assert.equal(tracker.complete(), false);
  tracker.update('txid', event('Complete'));
  assert.equal(tracker.complete(), true);
  tracker.update('utxo', event('Started'));
  assert.equal(tracker.complete(), false);
});
