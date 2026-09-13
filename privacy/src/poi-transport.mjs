import { createRequire } from 'node:module';
import { readResponseBytes, poiResponseLimit } from './response-limit.mjs';
const require = createRequire(import.meta.url);

export function installPOITransport(poiURL) {
  if (new URL(poiURL).protocol !== 'https:') throw new Error('POI requires HTTPS');
  const axios = require('axios');
  // Use Axios' supported fetch adapter; retain its JSON and error handling.
  // Scope to the approved POI service, leaving all other HTTP clients unchanged.
  const id = axios.interceptors.request.use(config => {
    if (axios.getUri(config) === poiURL) {
      config.adapter = 'fetch';
      config.timeout = Math.min(config.timeout || 15000, 15000);
      config.fetchOptions = { ...config.fetchOptions, redirect: 'error' };
      // Supply Axios' supported fetch environment hook so parsing is bounded
      // even when the server omits Content-Length or sends compressed content.
      config.env = { ...config.env, fetch: async (request, init) => {
        const signal = init?.signal ?? request?.signal;
        const response = await globalThis.fetch(request, init);
        const bytes = await readResponseBytes(response, { maximumBytes: poiResponseLimit, signal });
        const headers = new Headers(response.headers);
        headers.delete('content-encoding'); headers.delete('content-length');
        return new Response([204, 205, 304].includes(response.status) ? null : bytes,
          { status: response.status, statusText: response.statusText, headers });
      } };
    }
    return config;
  });
  return () => axios.interceptors.request.eject(id);
}
