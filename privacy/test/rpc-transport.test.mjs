import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FetchRequest } from 'ethers';
import { createFetchTransport, installRpcTransport, connectionErrorCode } from '../src/rpc-transport.mjs';

test('fetch transport preserves RPC bytes and headers and decodes response once', async () => {
  const request = new FetchRequest('https://example.com/rpc');
  request.body = JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 });
  request.setHeader('authorization', 'Bearer test-only');
  const response = await createFetchTransport(async (url, options) => {
    assert.equal(url, request.url);
    assert.equal(options.headers.authorization, 'Bearer test-only');
    assert.deepEqual(options.body, request.body);
    assert.equal(options.redirect, 'error');
    return new Response('{"result":"0xaa36a7"}', { headers: { 'content-encoding': 'gzip' } });
  })(request);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-encoding'], undefined);
  assert.equal(JSON.parse(new TextDecoder().decode(response.body)).result, '0xaa36a7');
});

test('cancelled requests abort and endpoint-bearing errors are sanitized', async () => {
  const request = new FetchRequest('https://example.com/private-token');
  const transport = createFetchTransport(async (_url, options) => {
    assert.equal(options.signal.aborted, true);
    throw new Error(request.url);
  });
  await assert.rejects(transport(request, { cancelled: true, addListener() {} }),
    error => error.code === 'CANCELLED' && !error.message.includes('private-token'));
  assert.equal(connectionErrorCode({ cause: { code: 'ETIMEDOUT' } }), 'ETIMEDOUT');
  assert.equal(connectionErrorCode({ code: 'secret-token' }), 'SDK_ERROR');
});

test('RPC override covers application and SDK ethers and restores original transports', async () => {
  const require = createRequire(import.meta.url);
  const Request = require('ethers').FetchRequest;
  const url = 'https://example.com/rpc';
  const esmPrevious = new FetchRequest(url).getUrlFunc;
  const sdkPrevious = new Request(url).getUrlFunc;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('ok'); };
  const reset = installRpcTransport(url);
  try {
    await new FetchRequest(url).send();
    await new Request(url).send();
    assert.equal(calls, 2);
  } finally { reset(); globalThis.fetch = originalFetch; }
  assert.equal(new FetchRequest(url).getUrlFunc, esmPrevious);
  assert.equal(new Request(url).getUrlFunc, sdkPrevious);
});

test('transport aborts stalled requests at the ethers deadline', async () => {
  const request = new FetchRequest('https://example.com/rpc');
  request.timeout = 10;
  const transport = createFetchTransport((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  await assert.rejects(transport(request), error => error.code === 'TIMEOUT');
});

test('insecure authenticated loopback requests retain ethers protections', async () => {
  const request = new FetchRequest('http://localhost/rpc');
  request.setCredentials('test', 'test');
  await assert.rejects(createFetchTransport(() => assert.fail('must not send'))(request), /Insecure/);
});
