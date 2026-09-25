import { validatePrivateRequest } from './private-request.mjs';

export const requestHistoryLimit = 128;
export function validatePrivateRequestHistory(value, { recipient, now = Math.floor(Date.now() / 1000), ...dependencies }) {
  const fail = () => { throw new Error('Saved payment requests could not be verified.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'paymentStatus,requests,source,version'
      || value.version !== 1 || value.source !== 'encrypted-local-account-history'
      || value.paymentStatus !== 'not-checked' || !Array.isArray(value.requests)
      || value.requests.length > requestHistoryLimit || !Number.isSafeInteger(now)) fail();
  dependencies.validateRecipient(recipient);
  const ids = new Set();
  const requests = value.requests.map(request => {
    // Historical viewing may include expired requests. Payment/import validation
    // still uses the current clock and must never use this historical time.
    if (!Number.isSafeInteger(request?.createdAt) || request.createdAt > now + 5) fail();
    const normalized = validatePrivateRequest(request, { ...dependencies, now: request.createdAt });
    if (normalized.recipient !== recipient || ids.has(normalized.id)) fail();
    ids.add(normalized.id);
    return normalized;
  });
  requests.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  return Object.freeze({ version: 1, source: 'encrypted-local-account-history',
    paymentStatus: 'not-checked', requests: Object.freeze(requests) });
}
export function privateRequestHistory(requests, dependencies) {
  return validatePrivateRequestHistory({ version: 1, source: 'encrypted-local-account-history',
    paymentStatus: 'not-checked', requests }, dependencies);
}
