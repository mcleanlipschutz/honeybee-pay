import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readResponseBytes, readResponseJSON, rpcResponseLimit, poiResponseLimit } from '../src/response-limit.mjs';
import { makeReadOnlyRpc } from '../src/network-preflight.mjs';
import { installPOITransport } from '../src/poi-transport.mjs';

test('response limit preserves split UTF-8 and exact-limit JSON', async () => {
  const bytes = new TextEncoder().encode('{"value":"蜂"}');
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 11)); controller.enqueue(bytes.slice(11)); controller.close();
  } });
  assert.deepEqual(await readResponseJSON(new Response(stream), { maximumBytes: bytes.length }), { value: '蜂' });
  await assert.rejects(readResponseJSON(new Response(Uint8Array.of(0xff))));
  let count = 0;
  const tiny = new ReadableStream({ pull(controller) {
    if (count++ < 70000) controller.enqueue(Uint8Array.of(7)); else controller.close();
  } });
  const assembled = await readResponseBytes(new Response(tiny), { maximumBytes: 70000 });
  assert.equal(assembled.length, 70000);
  assert.ok(assembled.every(value => value === 7));
});

test('oversized streamed and understated decoded bodies are cancelled', async () => {
  for (const headers of [{}, { 'content-length': '1', 'content-encoding': 'gzip' }]) {
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5)); },
      cancel() { cancelled = true; } });
    await assert.rejects(readResponseBytes(new Response(stream, { headers }), { maximumBytes: 4 }),
      { code: 'RESPONSE_TOO_LARGE' });
    assert.equal(cancelled, true);
    assert.equal(stream.locked, false);
  }
});

test('advertised oversized bodies fail before consumption, and abort ends a stalled read', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(readResponseBytes(new Response(stream, { headers: { 'content-length': '99999999999999999999' } })),
    { code: 'RESPONSE_TOO_LARGE' });
  assert.equal(cancelled, true);
  const controller = new AbortController();
  const stalled = new ReadableStream();
  const read = readResponseBytes(new Response(stalled), { signal: controller.signal });
  controller.abort();
  await assert.rejects(read, { name: 'AbortError' });
  assert.equal(stalled.locked, false);
});

test('read-only RPC rejects an oversized payload without automatic retries or URL leakage', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(new Uint8Array(rpcResponseLimit + 1)); };
  try {
    await assert.rejects(makeReadOnlyRpc('https://example.test/private-fixture')('eth_chainId', []),
      error => error.message === 'Read-only RPC request failed; check endpoint access');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('actual Axios POI fetch adapter rejects oversized service replies', async () => {
  const axios = createRequire(import.meta.url)('axios');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array(poiResponseLimit + 1));
  const reset = installPOITransport('https://example.test/poi');
  try { await assert.rejects(axios.post('https://example.test/poi', { id: 1 })); }
  finally { reset(); globalThis.fetch = original; }
});
