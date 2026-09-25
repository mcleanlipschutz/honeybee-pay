import { walletInterface } from './deployment-check.mjs';
import { decodePrivatePaymentBatch, paymentHash, paymentProxy } from './payment-verification.mjs';

const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-fA-F][a-fA-F0-9]*)$/.test(value);
const word = value => typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);
const hex = value => '0x' + value.toString(16);
const topic = walletInterface.getEvent('Nullified').topicHash;

// Read-only discovery, not receipt verification or permission to retry. A
// missing event/unspent note says nothing about future execution or a mempool.
// Queries use the configured RPC, a fixed head, and at most 4096 recent blocks.
export async function inspectOriginalPaymentChain({ record, rpc, checkSession, onStage = () => {} }) {
  const expected = decodePrivatePaymentBatch(record.populated.transaction,
    record.populated.nullifiers, record.quote.minGasPriceWei);
  const deadline = Date.now() + 45000;
  const guard = () => { checkSession(); if (Date.now() >= deadline) throw new Error('Recovery lookup budget exceeded'); };
  const read = async (method, params) => { guard(); const value = await rpc(method, params); guard(); return value; };
  const report = (stage, reason) => { try { onStage(stage, reason); } catch {} };
  if (BigInt(await read('eth_chainId', [])) !== 11155111n) throw new Error('Wrong receipt network');
  const head = await read('eth_getBlockByNumber', ['latest', false]);
  if (!quantity(head?.number) || !word(head?.hash)) throw new Error('Recovery block unavailable');
  const stable = async () => {
    const end = await read('eth_getBlockByNumber', [head.number, false]);
    if (end?.number !== head.number || end?.hash !== head.hash) throw new Error('Recovery block changed');
  };
  report('nullifier-check', 'IN_PROGRESS');
  const spent = [];
  const keys = new Set();
  for (const tx of expected) {
    for (const nullifier of tx.nullifiers) {
      keys.add(`${tx.boundParams.treeNumber}:${paymentHash(nullifier)}`);
      const encoded = await read('eth_call', [{ to: paymentProxy,
        data: walletInterface.encodeFunctionData('nullifiers', [tx.boundParams.treeNumber, nullifier]) }, head.number]);
      const [value] = walletInterface.decodeFunctionResult('nullifiers', encoded);
      if (walletInterface.encodeFunctionResult('nullifiers', [value]).toLowerCase() !== encoded.toLowerCase()) throw new Error('Invalid recovery state');
      spent.push(value);
    }
  }
  await stable();
  const reason = spent.every(Boolean) ? 'NOTES_SPENT_AT_CHECK'
    : spent.some(Boolean) ? 'NOTES_PARTLY_SPENT' : 'NOTES_UNSPENT_AT_CHECK';
  report('nullifier-check', reason);
  if (!spent.some(Boolean)) return { reason, candidates: [] };

  report('chain-event-search', 'IN_PROGRESS');
  const upper = BigInt(head.number), lower = upper > 4095n ? upper - 4095n : 0n;
  const matches = new Map();
  let logCount = 0;
  for (let to = upper; to >= lower;) {
    const from = to - lower >= 511n ? to - 511n : lower;
    const logs = await read('eth_getLogs', [{ address: paymentProxy, topics: [topic], fromBlock: hex(from), toBlock: hex(to) }]);
    if (!Array.isArray(logs) || logs.length > 4096 || (logCount += logs.length) > 16384) throw new Error('Recovery log limit exceeded');
    for (const log of logs) {
      guard();
      // Logs are untrusted discovery hints. Ignore unrelated/malformed entries;
      // the caller still verifies exact calldata, canonical receipt and events.
      try {
        if (log.removed !== false || log.address?.toLowerCase() !== paymentProxy.toLowerCase()
            || !quantity(log.blockNumber) || BigInt(log.blockNumber) < from || BigInt(log.blockNumber) > to
            || !word(log.blockHash) || !word(log.transactionHash) || !quantity(log.logIndex)) continue;
        const parsed = walletInterface.parseLog(log);
        if (parsed?.name !== 'Nullified' || parsed.args.nullifier.length !== 1) continue;
        const canonical = walletInterface.encodeEventLog(parsed.fragment, parsed.args);
        if (canonical.data.toLowerCase() !== log.data.toLowerCase()
            || JSON.stringify(canonical.topics.map(x => x.toLowerCase())) !== JSON.stringify(log.topics.map(x => x.toLowerCase()))) continue;
        const key = `${parsed.args.treeNumber}:${paymentHash(parsed.args.nullifier[0])}`;
        if (!keys.has(key)) continue;
        const hash = paymentHash(log.transactionHash);
        if (!matches.has(hash)) {
          if (matches.size >= 8) throw new Error('Too many recovery candidates');
          matches.set(hash, new Set());
        }
        matches.get(hash).add(key);
      } catch { /* Never treat a malformed log as proof of settlement. */ }
    }
    const candidates = [...matches].filter(([, found]) => found.size === keys.size).map(([hash]) => hash);
    if (candidates.length) {
      await stable(); report('chain-event-search', 'CHAIN_MATCH_FOUND');
      return { reason, candidates };
    }
    to = from - 1n;
  }
  await stable(); report('chain-event-search', 'CHAIN_MATCH_NOT_FOUND_IN_WINDOW');
  return { reason, candidates: [] };
}
