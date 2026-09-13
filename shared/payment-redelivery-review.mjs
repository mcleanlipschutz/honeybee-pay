// Fresh consent for one specific saved payload. Compatible proofs must spend
// both original inputs; the backend preserves and verifies both authorizations.
export function validateRedeliveryReview(value, { quote, hash, now = Date.now(), earliest = 0 }) {
  const fail = () => { throw new Error('Original delivery review expired or changed'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const { reviewId, ...body } = value;
  if (Object.keys(value).sort().join(',') !== 'createdAt,deliveryKind,expiresAt,nonce,payloadDigest,purpose,quoteId,reviewId,version'
      || body.version !== 2 || body.purpose !== 'original-private-payment-recovery'
      || !['original-payload', 'compatible-proof'].includes(body.deliveryKind)
      || body.quoteId !== quote.quoteId || quote.version !== 2
      || !/^0x[a-f0-9]{64}$/.test(body.payloadDigest) || !/^0x[a-f0-9]{64}$/.test(body.nonce)
      || !Number.isSafeInteger(body.createdAt) || body.createdAt < earliest || body.createdAt < quote.createdAt
      || body.createdAt > now + 5000 || !Number.isSafeInteger(body.expiresAt)
      || body.expiresAt <= now || body.expiresAt <= body.createdAt
      || body.expiresAt > body.createdAt + 300000 || body.expiresAt > quote.request.expiresAt * 1000
      || reviewId !== hash(JSON.stringify(body))) fail();
  return Object.freeze({ ...body, reviewId });
}
