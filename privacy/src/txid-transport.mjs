import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readResponseBytes } from './response-limit.mjs';
const require = createRequire(import.meta.url);
export const txidEndpoint = 'https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql';

export function createHistoryFetch(previous, fetchImpl = globalThis.fetch) {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== txidEndpoint) return previous(input, init);
    const controller = new AbortController();
    const signal = init.signal ?? input?.signal;
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 15000);
    try {
      const method = init.method ?? input?.method ?? 'GET';
      const headers = init.headers ?? input?.headers;
      const body = init.body ?? (typeof input?.arrayBuffer === 'function' && !['GET', 'HEAD'].includes(method)
        ? await input.arrayBuffer() : undefined);
      const response = await fetchImpl(url, { ...init, method, headers, body,
        signal: controller.signal, redirect: 'error' });
      // Consume under the same deadline; preserve GraphQL errors for the SDK.
      const bytes = await readResponseBytes(response, { signal: controller.signal });
      const decodedHeaders = new Headers(response.headers);
      decodedHeaders.delete('content-encoding'); decodedHeaders.delete('content-length');
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers: decodedHeaders });
    } catch { throw new Error(controller.signal.aborted ? 'TXID_HISTORY_TIMEOUT' : 'TXID_HISTORY_NETWORK_ERROR'); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  };
}

// Wallet 10.9.0 has no public GraphQL transport setter. Adapt only the generated
// mesh options, retaining its endpoint, schema, queries, pagination and formatter.
export function installTxidTransport() {
  const root = dirname(dirname(require.resolve('@railgun-community/wallet')));
  if (require(join(root, 'package.json')).version !== '10.9.0') throw new Error('Review TXID transport for changed SDK');
  const graph = require(join(root, 'dist/services/railgun/railgun-txids/graphql/index.js'));
  const previous = graph.getMeshOptions;
  graph.getMeshOptions = async (...args) => {
    const options = await previous(...args);
    options.fetchFn = createHistoryFetch(options.fetchFn);
    return options;
  };
  return () => { graph.getMeshOptions = previous; };
}
