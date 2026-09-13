import { keccak256, stringToHex } from 'viem';
import { validatePaymentRequest, validatePrivateRecipient } from './private-request.mjs';

export function validatePaymentSummary(value, wallet, { allowExpired = true, now = Date.now() } = {}) {
  const result = structuredClone(value), { quoteId, ...q } = result.quote;
  const request = validatePaymentRequest(q.request, allowExpired ? q.request.createdAt : Math.floor(now / 1000));
  validatePrivateRecipient(q.broadcasterAddress);
  if (quoteId !== keccak256(stringToHex(JSON.stringify(q))) || q.version !== 1
      || q.network !== 'Ethereum_Sepolia' || q.chainId !== 11155111 || q.walletId !== wallet.id
      || q.privateAddress !== wallet.privateAddress || !/^[1-9][0-9]{0,6}$/.test(q.maxFeeUnits)
      || BigInt(q.maxFeeUnits) > 1000000n || !/^[1-9][0-9]{0,6}$/.test(q.feeUnits)
      || BigInt(q.feeUnits) > BigInt(q.maxFeeUnits)
      || q.totalUnits !== (BigInt(request.amountUnits) + BigInt(q.feeUnits)).toString()
      || !/^[1-9][0-9]{0,11}$/.test(q.minGasPriceWei) || BigInt(q.minGasPriceWei) > 50000000000n
      || !Number.isSafeInteger(q.createdAt) || q.createdAt > now + 5000
      || !Number.isSafeInteger(q.expiresAt) || q.expiresAt <= q.createdAt
      || q.expiresAt > q.createdAt + 600000 || q.expiresAt > request.expiresAt * 1000
      || (!allowExpired && q.expiresAt <= now)
      || !['quoted', 'unknown', 'pending', 'confirmed', 'reverted'].includes(result.status)
      || (result.hash !== null && !/^0x[a-f0-9]{64}$/.test(result.hash))) throw new Error('Private payment response changed');
  if (['confirmed', 'reverted'].includes(result.status)) {
    const receipt = result.receipt;
    if (!receipt || result.hashVerified !== true || receipt.status !== result.status || receipt.hash !== result.hash
        || receipt.chainId !== 11155111 || !/^0x[a-f0-9]{64}$/.test(receipt.blockHash)
        || !/^0x[a-f0-9]+$/.test(receipt.blockNumber) || !Number.isSafeInteger(receipt.timestamp)
        || !/^[0-9]{1,16}$/.test(receipt.confirmations) || BigInt(receipt.confirmations) < 2n
        || receipt.requestExpiredAtSettlement !== (receipt.timestamp >= request.expiresAt)) throw new Error('Private payment receipt is incomplete');
  }
  if (result.status === 'pending' && !result.hash) throw new Error('Pending payment hash is missing');
  return result;
}
