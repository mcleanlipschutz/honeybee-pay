import { createRequire } from 'node:module';
import { FetchRequest } from 'ethers';
import { makeReadOnlyRpc } from './network-preflight.mjs';

const require = createRequire(import.meta.url);

// Node fetch honors the runtime's configured proxy routing. Preserve ethers'
// request headers/body and cancellation without exposing endpoint credentials.
export function createFetchTransport(fetchImpl = globalThis.fetch) {
  return async (request, cancellation) => {
    makeReadOnlyRpc(request.url); // HTTPS or loopback HTTP only.
    if (new URL(request.url).protocol !== 'https:' && request.credentials && !request.allowInsecureAuthentication) {
      throw new Error('Insecure RPC authentication is disabled');
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (cancellation?.cancelled) cancel();
    cancellation?.addListener(cancel);
    const timeout = setTimeout(cancel, Math.min(request.timeout || 15000, 15000));
    try {
      const response = await fetchImpl(request.url, {
        method: request.method, headers: request.headers, body: request.body ?? undefined,
        signal: controller.signal, redirect: 'error',
      });
      const body = new Uint8Array(await response.arrayBuffer());
      const headers = Object.fromEntries(response.headers);
      // Fetch has already decoded compressed responses.
      delete headers['content-encoding'];
      delete headers['content-length'];
      return { statusCode: response.status, statusMessage: response.statusText, headers, body };
    } catch {
      const error = new Error('RPC transport failed');
      error.code = cancellation?.cancelled ? 'CANCELLED' : controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR';
      throw error;
    } finally { clearTimeout(timeout); }
  };
}

export function installRpcTransport(rpcURL) {
  makeReadOnlyRpc(rpcURL);
  const transport = createFetchTransport();
  // The SDK requires CommonJS ethers; the application imports its ESM entry.
  const classes = new Set([FetchRequest, require('ethers').FetchRequest]);
  const restore = [];
  for (const Request of classes) {
    const previous = new Request(rpcURL).getUrlFunc;
    Request.registerGetUrl((request, signal) => request.url === rpcURL
      ? transport(request, signal) : previous(request, signal));
    restore.push(() => Request.registerGetUrl(previous));
  }
  return () => restore.forEach(reset => reset());
}

export function connectionErrorCode(error) {
  const allowed = new Set(['TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR', 'CANCELLED', 'ECONNREFUSED',
    'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT']);
  for (let depth = 0; error && depth < 5; depth++, error = error.cause) {
    if (allowed.has(error.code)) return error.code;
  }
  return 'SDK_ERROR';
}
