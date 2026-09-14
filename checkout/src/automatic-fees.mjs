import { erc20Abi, formatUnits } from 'viem';
import { CHAIN_ID, USDC, approvePayment, buildTransfer } from './payment.mjs';
import { validateRequest } from './payment-request.mjs';

const MAX_NETWORK_COST = 1_000_000_000_000_000n; // 0.001 test ETH, an app policy, never a user input.
export class PaymentReviewError extends Error {}
const fail = message => { throw new PaymentReviewError(message); };
export async function loadWalletBalance(rpc, sender) {
  const [chain, code, decimals, balance, networkBalance] = await Promise.all([
    rpc.getChainId(), rpc.getCode({ address: USDC }),
    rpc.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' }),
    rpc.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [sender] }),
    rpc.getBalance({ address: sender }),
  ]);
  if (chain !== CHAIN_ID || !code || code === '0x' || decimals !== 6) fail('Your balance is unavailable. Please try again.');
  return { balance, networkBalance };
}
export async function reviewPayment({ rpc, sender, recipient, amount, request = null, sponsored = false, now = Date.now() }) {
  const approved = approvePayment({ sender, recipient, amount }, now);
  if (request) {
    const checked = validateRequest(request, now);
    if (checked.recipient !== approved.recipient || (checked.amount && checked.amount !== formatUnits(BigInt(approved.amountUnits), 6))) fail('The request changed. Open it again before paying.');
  }
  const balances = await loadWalletBalance(rpc, sender);
  if (balances.balance < BigInt(approved.amountUnits)) fail('There is not enough USDC. Add money to continue.');
  await rpc.simulateContract({ account: sender, address: USDC, abi: erc20Abi, functionName: 'transfer', args: [approved.recipient, BigInt(approved.amountUnits)] });
  const expiresAt = Math.min(approved.expiresAt, now + 60_000, request?.expiresAt ?? Infinity);
  if (sponsored) return Object.freeze({ approved, sponsored: true, expiresAt, request, feeLabel: 'Covered by Honeybee', transaction: buildTransfer(approved, approved, sender, now) });
  const [estimatedGas, fees] = await Promise.all([
    rpc.estimateContractGas({ account: sender, address: USDC, abi: erc20Abi, functionName: 'transfer', args: [approved.recipient, BigInt(approved.amountUnits)] }),
    rpc.estimateFeesPerGas(),
  ]);
  if (typeof estimatedGas !== 'bigint' || estimatedGas <= 0n || typeof fees.maxFeePerGas !== 'bigint' || fees.maxFeePerGas <= 0n || typeof fees.maxPriorityFeePerGas !== 'bigint' || fees.maxPriorityFeePerGas < 0n || fees.maxPriorityFeePerGas > fees.maxFeePerGas) fail('The network fee is unavailable. Please try again.');
  const gas = (estimatedGas * 120n + 99n) / 100n;
  const maximumFee = gas * fees.maxFeePerGas;
  if (maximumFee > MAX_NETWORK_COST) fail('The network is busy and fees are unusually high. Please try later.');
  if (balances.networkBalance < maximumFee) fail('Your test wallet needs a little test ETH for fees. Open Add money for setup.');
  const transaction = Object.freeze({ ...buildTransfer(approved, approved, sender, now), gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
  return Object.freeze({ approved, sponsored: false, expiresAt, request, maximumFee: maximumFee.toString(),
    feeLabel: `Up to ${formatUnits(maximumFee, 18)} test ETH`, transaction });
}
export async function revalidatePayment({ rpc, review, sender, now = Date.now() }) {
  if (!review || now >= review.expiresAt) fail('Your total needs updating. Review it once more.');
  buildTransfer(review.approved, review.approved, sender, now);
  if (review.request) validateRequest(review.request, now);
  const balances = await loadWalletBalance(rpc, sender);
  if (balances.balance < BigInt(review.approved.amountUnits)) fail('Your balance changed. Add money or review a smaller amount.');
  if (!review.sponsored && balances.networkBalance < BigInt(review.maximumFee)) fail('Your balance for fees changed. Review the payment again.');
  await rpc.simulateContract({ account: sender, address: USDC, abi: erc20Abi, functionName: 'transfer', args: [review.approved.recipient, BigInt(review.approved.amountUnits)] });
  if (Date.now() >= review.expiresAt) fail('Your total needs updating. Review it once more.');
  return review.transaction;
}
