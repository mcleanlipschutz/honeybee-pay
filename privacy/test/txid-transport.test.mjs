import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createHistoryFetch, installTxidTransport, txidEndpoint } from '../src/txid-transport.mjs';

test('history transport changes only the configured service and preserves GraphQL errors', async () => {
  const previous = async () => 'original';
  const fetchHistory = createHistoryFetch(previous, async (url, init) => {
    assert.equal(url, txidEndpoint);
    assert.equal(init.body, '{"query":"test"}');
    assert.equal(init.redirect, 'error');
    return new Response('{"errors":[{"message":"test-error"}]}');
  });
  assert.equal(await fetchHistory('https://example.com'), 'original');
  const response = await fetchHistory(txidEndpoint, { method: 'POST', body: '{"query":"test"}' });
  assert.deepEqual(await response.json(), { errors: [{ message: 'test-error' }] });
});

test('installed SDK history query uses the adapted mesh fetch with its original cursor', async () => {
  const require = createRequire(import.meta.url);
  const root = dirname(dirname(require.resolve('@railgun-community/wallet')));
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, txidEndpoint);
    const body = JSON.parse(init.body);
    assert.match(body.query, /transactions/);
    assert.equal(body.variables._0_idLow, '0x00');
    requests++;
    return new Response('{"data":{"_0_transactions":[]}}', { headers: { 'content-type': 'application/json' } });
  };
  const reset = installTxidTransport();
  try {
    const { quickSyncRailgunTransactionsV2 } = require(join(root, 'dist/services/railgun/railgun-txids/railgun-txid-sync-graph-v2.js'));
    assert.deepEqual(await quickSyncRailgunTransactionsV2({ type: 0, id: 11155111 }), []);
    assert.equal(requests, 1);
  } finally { reset(); globalThis.fetch = original; }
});
