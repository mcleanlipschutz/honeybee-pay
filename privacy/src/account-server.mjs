import { historyRestoreBodyLimit } from '../../shared/request-history-backup.mjs';
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { createAccountAuthenticator } from './account-auth.mjs';
import { createAccountWalletService } from './account-wallets.mjs';

const headers = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function json(res, status, value) {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json', 'Connection': 'close' });
  res.end(JSON.stringify(value));
}
function fail(status, code) { return Object.assign(new Error(code), { status, code }); }
async function body(req, limit) {
  let size = 0; const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'request-too-large');
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw fail(400, 'invalid-request'); }
}

// Serves only a built checkout and a narrow wallet API on IPv4 loopback. There is
// no configurable public bind address, permissive CORS, or token-in-URL path.
export async function startAccountServer({ directory, distDirectory, appId, verificationKey, syncConfig, port = 4173 }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid local port');
  const dist = await realpath(resolve(distDirectory));
  if (!(await stat(join(dist, 'index.html'))).isFile()) throw new Error('Build the checkout first');
  const authenticate = await createAccountAuthenticator({ appId, verificationKey });
  const accounts = await createAccountWalletService({ directory, appId, verificationKey, syncConfig });
  let origin, pending = 0;
  const limits = new Map();
  function rateLimit(key, maximum) {
    const now = Date.now();
    for (const [id, value] of limits) if (value.until <= now) limits.delete(id);
    const count = limits.get(key) ?? { count: 0, until: now + 60000 };
    if (count.count >= maximum || (!limits.has(key) && limits.size >= 256)) throw fail(429, 'try-later');
    count.count++; limits.set(key, count);
  }
  const server = createServer({ maxHeaderSize: 24576 }, async (req, res) => {
    let counted = false;
    try {
      if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== new URL(origin).host
          || (req.headers.origin && req.headers.origin !== origin)
          || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) {
        throw fail(403, 'local-origin-required');
      }
      if (req.url === '/api/runtime' && req.method === 'GET') {
        return json(res, 200, { mode: 'local-testnet', apiVersion: 1, chainId: 11155111, appId,
          identityVerification: 'deferred-for-testnet', accountSyncEnabled: !!syncConfig,
          shieldReviewEnabled: !!syncConfig, shieldPreflightEnabled: !!syncConfig, shieldSubmissionEnabled: false,
          privateRequestsEnabled: true, privatePaymentCheckEnabled: !!syncConfig });
      }
      const historyRestore = req.url === '/api/account-history/restore';
      if (req.url === '/api/account-wallet' || historyRestore) {
        const requestLimit = historyRestore ? historyRestoreBodyLimit : 16384;
        rateLimit('all', 90);
        if (req.method !== 'POST') throw fail(405, 'post-required');
        if (req.headers.origin !== origin || req.headers['x-honeybee-request'] !== 'wallet-v1') throw fail(403, 'local-origin-required');
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')
            || req.headers['content-encoding']) throw fail(415, 'json-required');
        if (Number(req.headers['content-length']) > requestLimit) throw fail(413, 'request-too-large');
        if (pending >= 4) throw fail(429, 'try-later');
        pending++; counted = true;
        const authorization = req.headers.authorization;
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw fail(401, 'sign-in-required');
        const accessToken = authorization.slice(7);
        let session;
        try { session = await authenticate(accessToken); } catch { throw fail(401, 'sign-in-required'); }
        rateLimit(session.ownerId, 30);
        const request = await body(req, requestLimit);
        if (!request || typeof request !== 'object' || Array.isArray(request) || 'accessToken' in request) throw fail(400, 'invalid-request');
        if (historyRestore !== (request.action === 'invoice-history-restore')) throw fail(400, 'invalid-request');
        try { return json(res, 200, await accounts.execute({ ...request, accessToken })); }
        catch { throw fail(400, 'wallet-operation-failed'); }
      }
      if (req.url?.startsWith('/api/')) throw fail(404, 'not-found');
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'get-required');
      let path;
      try { path = decodeURIComponent(req.url); } catch { throw fail(404, 'not-found'); }
      if (path === '/' || path === '/index.html') path = '/index.html';
      else if (!/^\/assets\/[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').includes('..')) throw fail(404, 'not-found');
      const filename = await realpath(join(dist, path));
      if (!filename.startsWith(dist + sep) || !types[extname(filename)]) throw fail(404, 'not-found');
      const content = await readFile(filename);
      res.writeHead(200, { ...headers, 'Content-Type': types[extname(filename)] });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) json(res, error.status ?? 404, { error: error.code && error.status ? error.code : 'not-found' });
      req.resume();
    } finally { if (counted) pending--; }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { origin = `http://127.0.0.1:${server.address().port}`; resolveReady(); });
  });
  return { origin, async close() {
    server.closeIdleConnections();
    await new Promise((resolveClosed, reject) => server.close(error => error ? reject(error) : resolveClosed()));
  } };
}
