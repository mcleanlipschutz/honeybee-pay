import { authenticate } from './auth.mjs';
import { database, createIntent, registerHash, reconcile, totals } from './payment-count.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
let refreshing;
let lastRefresh = 0;
export function createHandler({ auth = authenticate, reconcilePayments = reconcile } = {}) {
  return async (request, env) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      return env.ASSETS.fetch(request);
    }
    try {
      if (url.pathname === '/api/payment-count' && request.method === 'GET') {
        const db = database(env);
        // Coalesce reads; the database, not this cache, owns the count.
        if (Date.now() - lastRefresh > 60000) {
          refreshing ||= reconcilePayments(db).then(() => { lastRefresh = Date.now(); }).finally(() => { refreshing = null; });
          await refreshing;
        }
        return json(await totals(db));
      }
      if (!['/api/payment-intents', '/api/payment-submissions'].includes(url.pathname)) return json({ error: 'Not found.' }, 404);
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Origin not allowed.' }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required.' }, 415);
      let owner;
      try { owner = await auth(request); } catch { return json({ error: 'Sign in again to prepare your payment.' }, 401); }
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Missing payment details.' }, 400);
      const chunks = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); }
        chunks.push(value);
      }
      let body;
      try { body = JSON.parse(await new Blob(chunks).text()); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); }
      catch { return json({ error: 'Invalid payment details.' }, 400); }
      const db = database(env);
      if (url.pathname === '/api/payment-intents') return json(await createIntent(db, owner, body), 201);
      await registerHash(db, owner, body.id, body.hash);
      return json({ status: 'pending' }, 202);
    } catch {
      // Never return token, wallet, SQL or provider details to public callers.
      return json({ error: 'Payment tracking is temporarily unavailable. Please try again.' }, 503);
    }
  };
}
export default { fetch: createHandler() };
