import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installPOITransport } from '../src/poi-transport.mjs';
test('POI transport uses native fetch only for its approved endpoint and preserves the request', async () => {
  const require = createRequire(import.meta.url);
  const axios = require('axios');
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async request => {
    assert.equal(request.url, 'https://example.com/poi');
    assert.equal(request.redirect, 'error');
    assert.deepEqual(await request.json(), { id: 1, method: 'ppoi_validated_txid', params: {} });
    calls++;
    return Response.json({ id: 1, result: { validatedTxidIndex: 7 } });
  };
  const reset = installPOITransport('https://example.com/poi');
  try {
    const result = await axios.post('https://example.com/poi', { id: 1, method: 'ppoi_validated_txid', params: {} });
    assert.equal(result.data.result.validatedTxidIndex, 7);
    const other = await axios.get('https://example.com/other', { adapter: async config => ({ data: 'untouched', status: 200, headers: {}, config }) });
    assert.equal(other.data, 'untouched');
    assert.equal(calls, 1);
  } finally { reset(); globalThis.fetch = previous; }
  assert.throws(() => installPOITransport('http://example.com/poi'));
});
