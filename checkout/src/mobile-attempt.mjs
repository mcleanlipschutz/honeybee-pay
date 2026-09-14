import { erc20Abi, encodeFunctionData, parseAbiItem, isAddress } from 'viem';
import { CHAIN_ID, USDC, verifyReceipt } from './payment.mjs';

const event = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
export const attemptKey = address => `honeybee:payment:v1:${CHAIN_ID}:${address.toLowerCase()}`;
export function readAttempt(storage, address) {
  const raw = storage.getItem(attemptKey(address));
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    if (![a.approved?.sender, a.approved?.recipient].every(v => typeof v === 'string' && isAddress(v, { strict: true }))
      || /^0x0{40}$/i.test(a.approved.recipient) || a.approved.sender.toLowerCase() === a.approved.recipient.toLowerCase()
      || typeof a.approved.amountUnits !== 'string' || !/^[1-9]\d{0,7}$/.test(a.approved.amountUnits) || BigInt(a.approved.amountUnits) > 10_000_000n
      || !Number.isSafeInteger(a.approved.expiresAt) || a.approved.expiresAt <= 0
      || !Number.isSafeInteger(a.createdAt) || a.createdAt <= 0 || a.createdAt >= a.approved.expiresAt) throw new Error();
    if (a.version !== 1 || !/^[a-f0-9-]{36}$/i.test(a.id || '') || a.approved.sender.toLowerCase() !== address.toLowerCase() || a.approved.chainId !== CHAIN_ID || a.approved.token !== USDC
      || !/^\d+$/.test(a.afterBlock) || !Number.isSafeInteger(a.nonce) || a.nonce < 0
      || !['pending', 'confirmed', 'failed'].includes(a.status) || (a.hash && !/^0x[0-9a-f]{64}$/i.test(a.hash))) throw new Error();
    return a;
  } catch { throw new Error('Your previous payment needs checking. Open this wallet in the original browser.'); }
}
export function saveAttempt(storage, address, attempt) {
  const raw = JSON.stringify(attempt);
  storage.setItem(attemptKey(address), raw);
  if (storage.getItem(attemptKey(address)) !== raw) throw new Error('Allow storage in this browser before sending a payment.');
  return attempt;
}
export function beginAttempt(storage, address, data) {
  if (readAttempt(storage, address)?.status === 'pending') throw new Error('Check your previous payment before sending again.');
  return saveAttempt(storage, address, { ...data, id: crypto.randomUUID(), version: 1, status: 'pending', hash: null });
}
// Caller holds the address's Web Lock. A slow recovery must not erase a newer send.
export function commitAttemptResult(storage, address, result) {
  const current = readAttempt(storage, address);
  if (!current || current.id !== result.id || current.status !== 'pending') return current;
  return saveAttempt(storage, address, result);
}
export function isExplicitRejection(error) {
  // Do not use message text or HTTP errors as evidence that no transaction was sent.
  return error?.code === 4001 || error?.cause?.code === 4001;
}
export async function inspectAttempt(rpc, attempt, suppliedHash) {
  if (await rpc.getChainId() !== CHAIN_ID) throw new Error('The payment network is unavailable.');
  const a = attempt.approved;
  let hashes = [attempt.hash || suppliedHash].filter(Boolean);
  if (hashes.some(hash => !/^0x[0-9a-f]{64}$/i.test(hash))) throw new Error('Enter the complete transaction reference.');
  if (!hashes.length) {
    const head = await rpc.getBlockNumber();
    const fromBlock = BigInt(attempt.afterBlock) + 1n;
    const toBlock = head < fromBlock + 999n ? head : fromBlock + 999n;
    if (toBlock < fromBlock) return null;
    const logs = await rpc.getLogs({ address: USDC, event, args: { from: a.sender, to: a.recipient }, fromBlock, toBlock, strict: true });
    hashes = [...new Set(logs.filter(l => !l.removed && l.args.value === BigInt(a.amountUnits)).map(l => l.transactionHash))].slice(0, 20);
  }
  for (const hash of hashes) {
    const [receipt, tx, head] = await Promise.all([rpc.getTransactionReceipt({ hash }), rpc.getTransaction({ hash }), rpc.getBlockNumber()]);
    if (!receipt || !tx || receipt.blockNumber <= BigInt(attempt.afterBlock) || head - receipt.blockNumber + 1n < 2n) continue;
    const block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
    if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || tx.hash.toLowerCase() !== hash.toLowerCase()
      || tx.nonce !== attempt.nonce || tx.from.toLowerCase() !== a.sender.toLowerCase() || tx.to?.toLowerCase() !== USDC.toLowerCase() || tx.value !== 0n
      || tx.input.toLowerCase() !== encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [a.recipient, BigInt(a.amountUnits)] }).toLowerCase()
      || block.hash !== receipt.blockHash || tx.blockHash !== block.hash || tx.blockNumber !== block.number || block.number !== receipt.blockNumber
      || receipt.logs.some(l => l.removed || l.blockHash !== block.hash || l.transactionHash !== receipt.transactionHash)) continue;
    if (receipt.status === 'reverted') return { ...attempt, hash, status: 'failed' };
    verifyReceipt(receipt, a);
    return { ...attempt, hash, status: 'confirmed' };
  }
  return null;
}
