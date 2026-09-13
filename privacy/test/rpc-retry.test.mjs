import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReadOnlyRpc } from '../src/network-preflight.mjs';
test('read-only RPC retries transient transport failures without changing request identity', async () => {
  const previous = globalThis.fetch;
  let count = 0;
  const ids = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); ids.push(body.id);
    if (++count < 3) throw new TypeError('temporary network error');
    return Response.json({ jsonrpc: '2.0', id: body.id, result: '0xaa36a7' });
  };
  try {
    assert.equal(await makeReadOnlyRpc('https://example.com')('eth_chainId', []), '0xaa36a7');
    assert.deepEqual(ids, [1, 1, 1]);
  } finally { globalThis.fetch = previous; }
});
test('RPC protocol errors fail immediately instead of being retried', async () => {
  const previous = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => { count++; return Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602 } }); };
  try {
    await assert.rejects(makeReadOnlyRpc('https://example.com')('eth_call', []));
    assert.equal(count, 1);
  } finally { globalThis.fetch = previous; }
});
