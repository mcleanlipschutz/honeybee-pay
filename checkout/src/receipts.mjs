import { decodeEventLog, erc20Abi, getAddress, isAddress, formatUnits } from 'viem';
import { CHAIN_ID, USDC } from './payment.mjs';

const ENDPOINT = 'https://ethereum-sepolia-rpc.publicnode.com';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x[0-9a-fA-F]+$/;
const PAGE_BLOCKS = 10_000n;
export class ReceiptError extends Error {}
function fail(message = 'This transfer could not be verified. Refresh and try again.') { throw new ReceiptError(message); }
function number(value) { if (typeof value !== 'string' || !HEX.test(value)) fail(); return BigInt(value); }
function address(value) { if (!isAddress(value, { strict: false })) fail('Sign in to load receipts for your wallet.'); return getAddress(value.toLowerCase()); }
function checkSignal(signal) { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); }

export async function receiptRpc(method, params, signal) {
  const response = await fetch(ENDPOINT, { method: 'POST', credentials: 'omit', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  if (!response.ok) fail('Receipt history is temporarily unavailable. Try again.');
  const data = await response.json();
  if (data.error || data.result === undefined) fail('Receipt history is temporarily unavailable. Try again.');
  return data.result;
}

// This is the PUBLIC receipt adapter. Private receipts must come from verified
// decrypted wallet state and encrypted storage, never from this log scanner.
export function verifyPublicReceipts({ receipt, block, head, wallet, expectedHash }) {
  const owner = address(wallet).toLowerCase();
  if (!HASH.test(expectedHash) || receipt?.transactionHash?.toLowerCase() !== expectedHash.toLowerCase()
      || receipt.status !== '0x1' || !HASH.test(receipt.blockHash ?? '')
      || block?.hash?.toLowerCase() !== receipt.blockHash.toLowerCase()
      || number(block.number) !== number(receipt.blockNumber) || !Array.isArray(receipt.logs)) fail();
  if (head - number(receipt.blockNumber) + 1n < 2n) fail('Waiting for two confirmations. Refresh shortly.');
  const seconds = number(block.timestamp);
  if (seconds > 8_640_000_000_000n) fail();
  const date = new Date(Number(seconds) * 1000).toISOString();
  const results = new Map();
  for (const log of receipt.logs) {
    if (log.address?.toLowerCase() !== USDC.toLowerCase() || log.topics?.[0] !== TRANSFER) continue;
    if (log.removed || log.transactionHash?.toLowerCase() !== expectedHash.toLowerCase()
        || log.blockHash?.toLowerCase() !== block.hash.toLowerCase()
        || number(log.blockNumber) !== number(block.number)) fail();
    let decoded;
    try { decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, strict: true }); }
    catch { fail(); }
    const { from, to, value } = decoded.args;
    if (decoded.eventName !== 'Transfer' || (from.toLowerCase() !== owner && to.toLowerCase() !== owner) || value <= 0n) continue;
    const index = number(log.logIndex).toString();
    const id = `${CHAIN_ID}:${expectedHash.toLowerCase()}:${index}`;
    if (results.has(id)) fail();
    results.set(id, Object.freeze({ id, privacy: 'public', source: 'sepolia-usdc-transfer', status: 'confirmed',
      chainId: CHAIN_ID, token: USDC, symbol: 'USDC', decimals: 6,
      sender: getAddress(from), recipient: getAddress(to), amountUnits: value.toString(), date,
      transactionHash: expectedHash.toLowerCase(), blockNumber: number(block.number).toString(), logIndex: index,
      direction: from.toLowerCase() === owner ? (to.toLowerCase() === owner ? 'self' : 'sent') : 'received' }));
  }
  return [...results.values()];
}

async function context(request, signal) {
  const chain = await request('eth_chainId', [], signal);
  if (number(chain) !== BigInt(CHAIN_ID)) fail('Receipt network did not match Sepolia. Nothing was loaded.');
  return number(await request('eth_blockNumber', [], signal));
}
async function loadHash(hash, wallet, head, request, signal) {
  checkSignal(signal);
  const receipt = await request('eth_getTransactionReceipt', [hash], signal);
  if (!receipt) fail('Transaction is pending or was not found on Sepolia.');
  const block = await request('eth_getBlockByNumber', [receipt.blockNumber, false], signal);
  checkSignal(signal);
  return verifyPublicReceipts({ receipt, block, head, wallet, expectedHash: hash });
}
export async function findPublicReceipts({ hash, wallet, signal, request = receiptRpc }) {
  address(wallet);
  if (!HASH.test(hash)) fail('Enter a complete transaction hash beginning with 0x.');
  const head = await context(request, signal);
  const records = await loadHash(hash, wallet, head, request, signal);
  if (!records.length) fail('No confirmed USDC transfer for this wallet was found in that transaction.');
  return records;
}
export async function loadPublicReceiptPage({ wallet, beforeBlock, signal, request = receiptRpc }) {
  const owner = address(wallet);
  if (beforeBlock !== undefined && (typeof beforeBlock !== 'bigint' || beforeBlock < 0n)) fail();
  const head = await context(request, signal);
  if (head < 1n) return { records: [], nextBlock: null };
  const to = beforeBlock === undefined || beforeBlock > head - 1n ? head - 1n : beforeBlock;
  const from = to >= PAGE_BLOCKS - 1n ? to - PAGE_BLOCKS + 1n : 0n;
  const topic = '0x' + owner.slice(2).toLowerCase().padStart(64, '0');
  const filter = { address: USDC, fromBlock: '0x'+from.toString(16), toBlock: '0x'+to.toString(16) };
  const logs = await Promise.all([
    request('eth_getLogs', [{ ...filter, topics: [TRANSFER, topic] }], signal),
    request('eth_getLogs', [{ ...filter, topics: [TRANSFER, null, topic] }], signal),
  ]);
  if (!logs.every(Array.isArray)) fail();
  const hashes = new Set();
  for (const log of logs.flat()) {
    if (log.removed || log.address?.toLowerCase() !== USDC.toLowerCase() || !HASH.test(log.transactionHash ?? '')
        || number(log.blockNumber) < from || number(log.blockNumber) > to) fail();
    hashes.add(log.transactionHash.toLowerCase());
  }
  // Do not silently truncate a busy wallet's activity or advance past a failure.
  if (hashes.size > 60) fail('Too much activity to load at once. Find a receipt by its transaction hash.');
  const records = [];
  const pending = [...hashes];
  for (let i = 0; i < pending.length; i += 3) {
    checkSignal(signal);
    const group = await Promise.all(pending.slice(i, i + 3).map(hash => loadHash(hash, owner, head, request, signal)));
    records.push(...group.flat());
  }
  checkSignal(signal);
  return { records: sortReceipts(records), nextBlock: from === 0n ? null : from - 1n };
}
export function sortReceipts(records) {
  return [...new Map(records.map(r => [r.id, r])).values()].sort((a, b) => {
    const block = BigInt(b.blockNumber) - BigInt(a.blockNumber);
    return block > 0n ? 1 : block < 0n ? -1 : Number(BigInt(b.logIndex) - BigInt(a.logIndex));
  });
}
export function receiptText(receipt) {
  return ['Honeybee Pay — public USDC transfer receipt', 'Status: Confirmed (at least two confirmations)',
    `Date (UTC): ${receipt.date}`, `Amount: ${formatUnits(BigInt(receipt.amountUnits), receipt.decimals)} ${receipt.symbol}`,
    `Sender: ${receipt.sender}`, `Recipient: ${receipt.recipient}`, 'Network: Ethereum Sepolia (testnet)',
    `Token contract: ${receipt.token}`, `Transaction: ${receipt.transactionHash}`, `Transfer log: ${receipt.logIndex}`,
    `Block: ${receipt.blockNumber}`, `Receipt reference: ${receipt.id}`,
    '', 'Test assets only. This confirms an onchain token transfer, not delivery of goods, an invoice, or a tax receipt.',
    'Public transfer details are visible on Sepolia. This is not a ZK-private receipt.',
    'Reopen Honeybee Pay to recheck the transaction against the network.',
    `https://sepolia.etherscan.io/tx/${receipt.transactionHash}`, ''].join('\n');
}
