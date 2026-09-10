import { createRequire } from 'node:module';
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
    }
    return config;
  });
  return () => axios.interceptors.request.eject(id);
}
