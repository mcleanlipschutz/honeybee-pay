import { createPublicClient, http, erc20Abi, encodeFunctionData, parseAbiItem } from 'viem';
import { sepolia } from 'viem/chains';
import { CHAIN_ID, USDC, approvePayment, verifyReceipt } from '../src/payment.mjs';

export const chain = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 10000, retryCount: 0 }) });
const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
// Only historical exception: the owner's observed checkout test, recorded in Segment 1N.
// Reverified on the server before insertion; never a numeric seed or a browser claim.
export const FIRST_PAYMENT = Object.freeze({
  id: 'historical-first-mobile-payment', owner: 'historical-reviewed',
  sender: '0x42Dd1069eEBB84caC0C8d37077A69c3399e0Cf11',
  recipient: '0xA1911d886700dd34dc292E626ADEE9E10453Cd87', amount_units: '1000000',
  tx_hash: '0x3247ad91ac4f8ee5b735dfeb53bad84e1d5e127be53840f62194034e6d00e9a5',
  after_block: 11675639, created_at: Date.parse('2026-09-10T14:50:00Z'), expires_at: Date.parse('2026-09-10T14:55:00Z'),
});
export function database(env) {
  if (!env.DB?.prepare) throw new Error('Payment count storage unavailable.');
  return env.DB;
}
export function checkedApproval(body, now = Date.now()) {
  const approval = approvePayment(body, now);
  if (!Number.isSafeInteger(body.expiresAt) || body.expiresAt <= now || body.expiresAt > now + 300000) throw new Error('Approval expired. Review again.');
  return { ...approval, expiresAt: body.expiresAt };
}
export async function verifyCountablePayment(row, hash, rpc = chain) {
  if (await rpc.getChainId() !== CHAIN_ID) throw new Error('Wrong network.');
  const [receipt, tx, finalized] = await Promise.all([
    rpc.getTransactionReceipt({ hash }), rpc.getTransaction({ hash }), rpc.getBlock({ blockTag: 'finalized' }),
  ]);
  if (!receipt || !tx || !finalized || receipt.blockNumber > finalized.number) return null;
  const block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
  const timestamp = Number(block.timestamp) * 1000;
  const approved = { sender: row.sender, recipient: row.recipient, amountUnits: row.amount_units };
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || tx.hash.toLowerCase() !== hash.toLowerCase()
      || receipt.blockHash !== block.hash || tx.blockHash !== block.hash || tx.blockNumber !== block.number
      || receipt.blockNumber <= BigInt(row.after_block) || block.number !== receipt.blockNumber
      || timestamp < row.created_at || timestamp > row.expires_at
      || row.sender.toLowerCase() === row.recipient.toLowerCase()
      || BigInt(row.amount_units) <= 0n || BigInt(row.amount_units) > 10000000n
      || tx.from.toLowerCase() !== row.sender.toLowerCase() || tx.to?.toLowerCase() !== USDC.toLowerCase() || tx.value !== 0n
      || tx.input.toLowerCase() !== encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [row.recipient, BigInt(row.amount_units)] }).toLowerCase()
      || receipt.logs.some(log => log.removed || log.transactionHash !== receipt.transactionHash || log.blockHash !== block.hash)) throw new Error('Payment does not match checkout.');
  verifyReceipt(receipt, approved);
  return { hash: hash.toLowerCase(), completedAt: timestamp };
}
export async function createIntent(db, owner, body, rpc = chain, now = Date.now()) {
  const a = checkedApproval(body, now);
  if (await rpc.getChainId() !== CHAIN_ID) throw new Error('Network unavailable.');
  const block = await rpc.getBlockNumber();
  const id = crypto.randomUUID();
  // The insertion and per-account limit are one atomic statement.
  const result = await db.prepare(`INSERT INTO checkout_payments
    (id, owner, sender, recipient, amount_units, created_at, expires_at, after_block)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE
    (SELECT COUNT(*) FROM checkout_payments WHERE owner = ? AND created_at > ?) < 20`)
    .bind(id, owner, a.sender, a.recipient, a.amountUnits, now, a.expiresAt, Number(block), owner, now - 3600000).run();
  if (result.meta.changes !== 1) throw new Error('Too many payment attempts. Please try later.');
  return { id };
}
export async function registerHash(db, owner, id, hash) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || !/^0x[0-9a-f]{64}$/i.test(hash || '')) throw new Error('Invalid payment reference.');
  const row = await db.prepare('SELECT id, candidate_hash FROM checkout_payments WHERE id = ? AND owner = ?').bind(id, owner).first();
  if (!row || (row.candidate_hash && row.candidate_hash !== hash.toLowerCase())) throw new Error('Payment reference unavailable.');
  // A candidate hash is not evidence of completion; reconciliation verifies it.
  await db.prepare('UPDATE checkout_payments SET candidate_hash = ? WHERE id = ? AND owner = ? AND candidate_hash IS NULL')
    .bind(hash.toLowerCase(), id, owner).run();
}
export async function reconcile(db, rpc = chain, now = Date.now()) {
  if (!await db.prepare('SELECT id FROM checkout_payments WHERE id = ?').bind(FIRST_PAYMENT.id).first()) {
    const first = await verifyCountablePayment(FIRST_PAYMENT, FIRST_PAYMENT.tx_hash, rpc);
    if (!first) throw new Error('Historical payment verification pending.');
    const r = FIRST_PAYMENT;
    await db.prepare(`INSERT OR IGNORE INTO checkout_payments
      (id, owner, sender, recipient, amount_units, created_at, expires_at, after_block, tx_hash, status, checked_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?)`)
      .bind(r.id, r.owner, r.sender, r.recipient, r.amount_units, r.created_at, r.expires_at, r.after_block, first.hash, now, first.completedAt).run();
  }
  const { results } = await db.prepare("SELECT * FROM checkout_payments WHERE status = 'pending' AND checked_at < ? ORDER BY checked_at LIMIT 2").bind(now - 60000).all();
  for (const row of results) {
    await db.prepare('UPDATE checkout_payments SET checked_at = ? WHERE id = ?').bind(now, row.id).run();
    try {
      let hashes = row.candidate_hash ? [row.candidate_hash] : [];
      if (!hashes.length) {
        // Recover after a browser closes between signing and reporting its hash.
        const head = await rpc.getBlockNumber();
        const from = BigInt(row.after_block) + 1n;
        const to = head < from + 1000n ? head : from + 1000n;
        if (to >= from) {
          const logs = await rpc.getLogs({ address: USDC, event: transfer, args: { from: row.sender, to: row.recipient }, fromBlock: from, toBlock: to, strict: true });
          hashes = [...new Set(logs.filter(l => !l.removed && l.args.value === BigInt(row.amount_units)).map(l => l.transactionHash))].slice(0, 2);
        }
      }
      for (const hash of hashes) {
        try {
        const done = await verifyCountablePayment(row, hash, rpc);
        if (!done) continue;
        await db.prepare("UPDATE checkout_payments SET tx_hash = ?, status = 'complete', completed_at = ? WHERE id = ? AND status = 'pending'").bind(done.hash, done.completedAt, row.id).run();
        break;
        } catch { /* A duplicate or mismatched candidate must not hide the next candidate. */ }
      }
      // Keep unconfirmed records for recovery for a day; they never increase the total.
      if (now > row.expires_at + 86400000) await db.prepare("UPDATE checkout_payments SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(row.id).run();
    } catch { /* RPC outages and mismatches never increase the counter. Retry later. */ }
  }
}
export async function totals(db) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM checkout_payments WHERE status = 'complete'").first();
  return { testPayments: row.count, network: 'sepolia', finality: 'finalized' };
}
