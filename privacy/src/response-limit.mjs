// Count decoded streaming bytes; Content-Length alone is not a safety boundary.
export const rpcResponseLimit = 8 * 1024 * 1024;
export const poiResponseLimit = 1024 * 1024;
export async function readResponseBytes(response, { maximumBytes = rpcResponseLimit, signal } = {}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > rpcResponseLimit) {
    throw new Error('Invalid response limit');
  }
  const reader = response.body?.getReader();
  const cancel = () => { if (reader) void reader.cancel().catch(() => {}); };
  const failSize = () => { const error = new Error('Remote response exceeds the permitted size'); error.code = 'RESPONSE_TOO_LARGE'; return error; };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    signal?.throwIfAborted();
    const length = response.headers.get('content-length');
    if (length && /^\d+$/.test(length) && BigInt(length) > BigInt(maximumBytes)) throw failSize();
    if (!reader) return new Uint8Array();
    // Retain one growing buffer, not a wrapper per tiny network chunk.
    let bytes = new Uint8Array(Math.min(maximumBytes, 64 * 1024));
    let size = 0;
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('Invalid response bytes');
      if (value.byteLength > maximumBytes - size) throw failSize();
      if (size + value.byteLength > bytes.length) {
        const grown = new Uint8Array(Math.min(maximumBytes, Math.max(bytes.length * 2, size + value.byteLength)));
        grown.set(bytes.subarray(0, size)); bytes = grown;
      }
      bytes.set(value, size); size += value.byteLength;
    }
    return bytes.slice(0, size);
  } catch (error) { cancel(); throw error; }
  finally { signal?.removeEventListener('abort', cancel); reader?.releaseLock(); }
}

export async function readResponseJSON(response, options) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readResponseBytes(response, options)));
}
