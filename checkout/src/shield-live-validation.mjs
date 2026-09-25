import { validateShieldPreflight } from './shield-preflight.mjs';

// Re-simulate the exact reviewed transaction through the authenticated local
// API immediately before the wallet prompt. A newer quote may not increase the
// user's approved gas/fee limits or change the approval/deposit stage.
export function createLiveShieldValidation({ review, quote, preflight, isCurrent, now = Date.now }) {
  const original = validateShieldPreflight(quote, review, now());
  return async () => {
    if (!isCurrent()) throw new Error('Account changed');
    validateShieldPreflight(original, review, now());
    const result = await preflight(review);
    if (!isCurrent()) throw new Error('Account changed');
    const fresh = validateShieldPreflight(result.shieldPreflight, review, now());
    if (JSON.stringify(result.shieldReview) !== JSON.stringify(review)
        || fresh.stage !== original.stage
        || JSON.stringify(fresh.transaction) !== JSON.stringify(original.transaction)
        || BigInt(fresh.gasLimitUnits) > BigInt(original.gasLimitUnits)
        || BigInt(fresh.maxFeePerGasWei) > BigInt(original.maxFeePerGasWei)
        || BigInt(fresh.maxPriorityFeePerGasWei) > BigInt(original.maxPriorityFeePerGasWei)) {
      throw new Error('Deposit terms or fees changed. Check the network fee again.');
    }
    validateShieldPreflight(original, review, now());
  };
}
