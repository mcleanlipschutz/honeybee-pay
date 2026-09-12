import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { checkPOIService } from '../src/poi-preflight.mjs';
import { poiResponseLimit } from '../src/response-limit.mjs';

const endpoint = 'https://example.test/poi';
const valid = () => ({ jsonrpc: '2.0', id: 1, result: { validatedTxidIndex: 7, validatedTxidMerkleroot: 'ab'.repeat(32) } });
const reset = () => new TypeError('synthetic private transport detail', { cause: Object.assign(new Error(), { code: 'ECONNRESET' }) });

test('POI availability retries one reset with the same public request, endpoint and deadline', async () => {
  const requests = [], signal = AbortSignal.timeout(2000);
  const result = await checkPOIService(endpoint, () => {}, { signal, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) throw reset();
    return Response.json(valid());
  } });
  assert.equal(requests.length, 2);
  for (const { url, options } of requests) {
    assert.equal(url, endpoint); assert.equal(options.signal, signal); assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { jsonrpc: '2.0', id: 1, method: 'ppoi_validated_txid',
      params: { chainType: '0', chainID: '11155111', txidVersion: 'V2_PoseidonMerkle' } });
  }
  assert.deepEqual(result, { status: 'poi-service-ready', network: 'Ethereum_Sepolia', paymentReady: false });
});

test('persistent resets stop after two attempts; other network and invalid responses never retry', async () => {
  let calls = 0;
  await assert.rejects(checkPOIService(endpoint, () => {}, { fetchImpl: async () => { calls++; throw reset(); } }));
  assert.equal(calls, 2);
  for (const reply of [
    () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }); },
    () => Response.json(valid(), { status: 503 }),
    () => Response.json({ ...valid(), error: { code: -1 } }),
    () => Response.json({ ...valid(), id: 2 }),
    () => Response.json({ id: 1, result: { validatedTxidIndex: -1, validatedTxidMerkleroot: 'ab'.repeat(32) } }),
    () => Response.json({ id: 1, result: { validatedTxidIndex: 7, validatedTxidMerkleroot: 'invalid' } }),
    () => Response.json(null),
    () => new Response('invalid json'),
    () => new Response(new Uint8Array(poiResponseLimit + 1)),
    () => new Response(new ReadableStream({ start(controller) { controller.error(reset()); } }), { status: 503 }),
  ]) {
    calls = 0;
    await assert.rejects(checkPOIService(endpoint, () => {}, { fetchImpl: async () => { calls++; return reply(); } }));
    assert.equal(calls, 1);
  }
});

test('abort or an expired account session prevents a retry and cancels stalled body reads', async () => {
  let calls = 0;
  const controller = new AbortController();
  const operation = checkPOIService(endpoint, () => {}, { signal: controller.signal, fetchImpl: async () => {
    calls++; queueMicrotask(() => controller.abort()); throw reset();
  } });
  await assert.rejects(operation, { name: 'AbortError' }); assert.equal(calls, 1);
  let expired = false;
  await assert.rejects(checkPOIService(endpoint, () => { if (expired) throw new Error('Session expired'); },
    { fetchImpl: async () => { expired = true; throw reset(); } }), /Session expired/);
  calls = 0;
  const duringDelay = new AbortController();
  const timer = setTimeout(() => duringDelay.abort(), 30);
  try {
    await assert.rejects(checkPOIService(endpoint, () => {}, { signal: duringDelay.signal,
      fetchImpl: async () => { calls++; throw reset(); } }), { name: 'AbortError' });
    assert.equal(calls, 1);
  } finally { clearTimeout(timer); }
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(new DOMException('Deadline', 'TimeoutError')), 30);
  try {
    await assert.rejects(checkPOIService(endpoint, () => {}, { signal: deadline.signal,
      fetchImpl: async () => { throw reset(); } }), { name: 'TimeoutError' });
  } finally { clearTimeout(deadlineTimer); }
  const bodyAbort = new AbortController();
  let cancelled = false;
  await assert.rejects(checkPOIService(endpoint, () => {}, { signal: bodyAbort.signal, fetchImpl: async () => {
    queueMicrotask(() => bodyAbort.abort());
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  } }), { name: 'AbortError' });
  assert.equal(cancelled, true);
});

test('a reset while reading a success response can retry without accepting partial data', async () => {
  let calls = 0;
  const result = await checkPOIService(endpoint, () => {}, { fetchImpl: async () => {
    if (++calls === 1) return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"id":1,')); controller.error(reset());
    } }));
    return Response.json(valid());
  } });
  assert.equal(calls, 2); assert.equal(result.status, 'poi-service-ready');
});

test('POI diagnostic rejects unsafe endpoints and emits only fixed failure fields', async () => {
  for (const url of ['http://example.test/poi', 'https://user:password@example.test/poi', endpoint + '#fragment']) {
    await assert.rejects(checkPOIService(url, () => {}, { fetchImpl: async () => assert.fail('No fetch allowed') }));
  }
  const preload = 'globalThis.fetch = async () => { throw Object.assign(new Error("synthetic-secret-detail"), { code: "ECONNRESET" }); };';
  try {
    await promisify(execFile)(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(preload),
      fileURLToPath(new URL('../src/poi-preflight-cli.mjs', import.meta.url))],
    { env: { ...process.env, HONEYBEE_POI_URL: endpoint }, timeout: 10000 });
    assert.fail('Diagnostic should fail');
  } catch (error) {
    assert.equal(error.code, 1); assert.equal(error.stdout, '');
    assert.deepEqual(JSON.parse(error.stderr), { status: 'poi-service-unavailable', stage: 'poi-service', reason: 'ECONNRESET', paymentReady: false });
  }
});
