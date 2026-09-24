// SPDX-License-Identifier: Apache-2.0
// Read-only infrastructure checks. Never sends witness data, signs or submits.
export const PROOF_SERVER_VERSION = '8.1.0';
export const DEFAULT_PROOF_URL = 'http://127.0.0.1:6300';

export function localProofUrl(value = DEFAULT_PROOF_URL) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Use a local proof server.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Use a loopback-only proof server without credentials or redirects.');
  return url.origin;
}

async function smallResponse(response) {
  if (!response.ok || !response.body) throw new Error('Proof service unavailable.');
  const reader = response.body.getReader();
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new Error('Unexpected proof service response.');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}

export async function checkProofService({ url = DEFAULT_PROOF_URL, fetcher = fetch } = {}) {
  // Reject remote URLs before any network call. Only health metadata is requested.
  const origin = localProofUrl(url);
  try {
    const [health, version, ready] = await Promise.all(['/health', '/version', '/ready'].map(async path => {
      const response = await fetcher(origin + path, { method: 'GET', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(3000) });
      return smallResponse(response);
    }));
    if (JSON.parse(health).status !== 'ok' || JSON.parse(ready).status !== 'ok'
      || version.trim() !== PROOF_SERVER_VERSION) throw new Error();
    return { ready: true, version: PROOF_SERVER_VERSION, privateInputsSent: false };
  } catch {
    return { ready: false, version: null, privateInputsSent: false,
      message: 'A ready local proof server at the pinned version was not verified.' };
  }
}
