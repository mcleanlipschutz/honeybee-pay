import { encodeFunctionData, getAddress, keccak256, stringToHex } from 'viem';
import { approvalAbi, shieldProxy, shieldToken } from './shield-review.mjs';

const units = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= 2n ** 256n) throw new Error('Invalid fee quantity');
  return BigInt(value);
};
const exactTransaction = (left, right) => Object.keys(left).sort().join(',') === Object.keys(right).sort().join(',')
  && Object.keys(right).every(key => left[key] === right[key]);

export function validateShieldPreflight(value, review, now = Date.now()) {
  const quote = structuredClone(value), { quoteId, ...body } = quote;
  const amount = units(review.amountUnits), allowance = units(quote.allowanceUnits);
  const stage = allowance < amount ? 'approval' : 'shield';
  const expectedTransaction = stage === 'shield' ? review.transaction : { ...review.transaction,
    to: shieldToken, data: encodeFunctionData({ abi: approvalAbi, functionName: 'approve', args: [shieldProxy, amount] }) };
  const estimate = units(quote.gasEstimateUnits), limit = units(quote.gasLimitUnits);
  const maxFee = units(quote.maxFeePerGasWei), priority = units(quote.maxPriorityFeePerGasWei);
  if (quoteId !== keccak256(stringToHex(JSON.stringify(body))) || quote.version !== 1
      || quote.status !== 'simulated-not-submitted' || quote.submissionEnabled !== false
      || quote.reviewId !== review.reviewId || quote.chainId !== 11155111 || quote.stage !== stage
      || !exactTransaction(quote.transaction, expectedTransaction)
      || units(quote.publicBalanceUnits) < amount || estimate < 21000n || limit > 2_000_000n
      || limit !== (estimate * 120n + 99n) / 100n || maxFee === 0n || maxFee > 50_000_000_000n || priority > maxFee
      || units(quote.maxNetworkFeeWei) !== limit * maxFee || units(quote.nativeBalanceWei) < limit * maxFee
      || !Number.isSafeInteger(quote.createdAt) || quote.createdAt <= 0 || quote.createdAt > now + 5000
      || !Number.isSafeInteger(quote.expiresAt) || quote.expiresAt <= now || quote.expiresAt <= quote.createdAt
      || quote.expiresAt > quote.createdAt + 60000 || quote.expiresAt > review.expiresAt
      || !/^0x[0-9a-fA-F]+$/.test(quote.blockNumber) || !/^0x[0-9a-fA-F]{64}$/.test(quote.blockHash)
      || !/^0x[0-9a-fA-F]+$/.test(quote.blockTimestamp)
      || BigInt(quote.blockTimestamp) * 1000n < BigInt(quote.createdAt - 60000)
      || BigInt(quote.blockTimestamp) * 1000n > BigInt(quote.createdAt + 15000)
      || BigInt(quote.expiresAt) > BigInt(quote.blockTimestamp) * 1000n + 60000n) throw new Error('Fee check expired or changed');
  Object.freeze(quote.transaction);
  return Object.freeze(quote);
}

// Preview only: no send callback, signed transaction, or configurable enable flag.
export function shieldConfirmationStep({ review, quote, publicAddress, chainId, now = Date.now() }) {
  if (!review || now >= review.expiresAt) return 'review';
  try { if (getAddress(publicAddress) !== getAddress(review.publicAddress)) return 'review'; }
  catch { return 'review'; }
  if (!quote || now >= quote.expiresAt) return 'check-fee';
  try { validateShieldPreflight(quote, review, now); } catch { return 'check-fee'; }
  if (chainId !== 'eip155:11155111' && chainId !== 11155111) return 'switch-network';
  return quote.stage;
}
