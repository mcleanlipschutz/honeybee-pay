import test from 'node:test';
import assert from 'node:assert/strict';
import { USDC } from '../src/payment.mjs';
import { verifyPublicReceipts, loadPublicReceiptPage, findPublicReceipts, receiptText } from '../src/receipts.mjs';

const buyer = '0x1111111111111111111111111111111111111111';
const merchant = '0x2222222222222222222222222222222222222222';
const hash = '0x'+'a'.repeat(64), blockHash = '0x'+'b'.repeat(64);
const block = { number: '0x4e20', hash: blockHash, timestamp: '0x6aa2c260' };
const topic = address => '0x'+address.slice(2).padStart(64, '0');
const log = { address: USDC, blockNumber: block.number, blockHash, transactionHash: hash, logIndex: '0x3', removed: false,
  topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(buyer),topic(merchant)],
  data: '0x'+(1_000_000n).toString(16).padStart(64,'0') };
const receipt = { transactionHash: hash, blockHash, blockNumber: block.number, status: '0x1', logs: [log] };
const args = { receipt, block, head: 25001n, wallet: buyer, expectedHash: hash };
function provider(calls = []) {
  return async (method, params) => {
    calls.push({ method, params });
    if (method === 'eth_chainId') return '0xaa36a7';
    if (method === 'eth_blockNumber') return '0x61a9';
    if (method === 'eth_getLogs') return [log];
    if (method === 'eth_getTransactionReceipt') return receipt;
    if (method === 'eth_getBlockByNumber') return block;
    throw Error('Unexpected request');
  };
}
test('the same confirmed transfer yields matching buyer/merchant receipts and a downloadable record', () => {
  const [sent] = verifyPublicReceipts(args);
  const [received] = verifyPublicReceipts({ ...args, wallet: merchant });
  assert.equal(sent.id, received.id);
  assert.equal(sent.direction, 'sent'); assert.equal(received.direction, 'received');
  assert.equal(sent.amountUnits, '1000000');
  assert.match(receiptText(received), /Amount: 1 USDC/);
  assert.match(receiptText(received), new RegExp(hash));
  assert.match(receiptText(received), /not a ZK-private receipt/);
  assert.deepEqual(verifyPublicReceipts({ ...args, wallet: '0x3333333333333333333333333333333333333333' }), []);
});
test('reverted, immature, wrong-hash, reorganized, removed and duplicate logs cannot issue a receipt', () => {
  for (const change of [
    { receipt: { ...receipt, status: '0x0' } }, { head: 20000n },
    { expectedHash: '0x'+'c'.repeat(64) }, { block: { ...block, hash: '0x'+'c'.repeat(64) } },
    { receipt: { ...receipt, logs: [{ ...log, removed: true }] } },
    { receipt: { ...receipt, logs: [log, log] } },
    { receipt: { ...receipt, logs: [{ ...log, transactionHash: '0x'+'c'.repeat(64) }] } },
  ]) assert.throws(() => verifyPublicReceipts({ ...args, ...change }));
  assert.deepEqual(verifyPublicReceipts({ ...args, receipt: { ...receipt, logs: [{ ...log, address: buyer }] } }), []);
});
test('history checks network, scans both directions with bounded ranges and verifies duplicate-discovered transactions once', async () => {
  const calls = [];
  const page = await loadPublicReceiptPage({ wallet: buyer, request: provider(calls) });
  assert.equal(page.records.length, 1); assert.equal(page.nextBlock, 15000n);
  const scans = calls.filter(c => c.method === 'eth_getLogs');
  assert.equal(scans.length, 2); assert.equal(scans[0].params[0].fromBlock, '0x3a99');
  assert.equal(scans[0].params[0].topics[1], topic(buyer));
  assert.equal(scans[1].params[0].topics[2], topic(buyer));
  assert.equal(calls.filter(c => c.method === 'eth_getTransactionReceipt').length, 1);
  await assert.rejects(loadPublicReceiptPage({ wallet: buyer, request: async () => '0x1' }), /network/);
  await assert.rejects(loadPublicReceiptPage({ wallet: buyer, request: async (method, params) => method === 'eth_getLogs' ? Promise.reject(Error('offline')) : provider()(method, params) }));
});
test('hash lookup works for the receiving wallet and rejects unrelated wallets or cancelled work', async () => {
  assert.equal((await findPublicReceipts({ hash, wallet: merchant, request: provider() }))[0].direction, 'received');
  await assert.rejects(findPublicReceipts({ hash, wallet: '0x3333333333333333333333333333333333333333', request: provider() }), /No confirmed USDC/);
  await assert.rejects(findPublicReceipts({ hash: '0xbad', wallet: buyer, request: provider() }), /complete transaction hash/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadPublicReceiptPage({ wallet: buyer, signal: controller.signal, request: provider() }), { name: 'AbortError' });
});
