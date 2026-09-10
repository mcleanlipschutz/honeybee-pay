import { keccak256, toUtf8Bytes } from 'ethers';

// One expiring unsigned review per authenticated owner. No tokens or passwords
// are retained. Restarting the local server requires a new review.
export function createShieldReviewCache({ now = Date.now, maximum = 64 } = {}) {
  const reviews = new Map();
  const live = session => {
    if (!/^[a-f0-9]{64}$/.test(session?.ownerId) || !Number.isSafeInteger(session.expiresAt)
        || session.expiresAt <= now()) throw new Error('Expired account session');
    for (const [owner, entry] of reviews) if (entry.review.expiresAt <= now()) reviews.delete(owner);
  };
  const get = (session, reviewId) => {
    live(session);
    const entry = reviews.get(session.ownerId);
    if (!entry || entry.review.reviewId !== reviewId) throw new Error('Review expired or replaced');
    return entry;
  };
  return {
    put(session, value) {
      live(session);
      const review = structuredClone(value), { reviewId, ...body } = review;
      if (reviewId !== keccak256(toUtf8Bytes(JSON.stringify(body))) || review.submissionEnabled !== false
          || review.status !== 'prepared-not-submitted' || !Number.isSafeInteger(review.expiresAt)
          || review.expiresAt > session.expiresAt || review.expiresAt > now() + 300000 || review.expiresAt <= now()
          || (!reviews.has(session.ownerId) && reviews.size >= maximum)) throw new Error('Invalid stored review');
      reviews.set(session.ownerId, { review, busy: false });
    },
    discard(session) { live(session); reviews.delete(session.ownerId); },
    async use(session, reviewId, operation) {
      const entry = get(session, reviewId);
      if (entry.busy) throw new Error('A fee check is already running');
      entry.busy = true;
      try {
        const result = await operation(structuredClone(entry.review));
        if (get(session, reviewId) !== entry) throw new Error('Review replaced');
        return result;
      } finally { entry.busy = false; }
    },
  };
}
