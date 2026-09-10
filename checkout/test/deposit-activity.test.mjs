import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, encodeEventTopics, encodeAbiParameters } from 'viem';
import { createDepositActivity, depositActivitySummary } from '../src/deposit-activity.mjs';
import { createShieldAttemptJournal, shieldAttemptScope, sealShieldIntent } from '../src/shield-attempts.mjs';
import { approvalAbi, shieldProxy, shieldToken } from '../src/shield-review.mjs';
import { approvalEventAbi } from '../src/shield-receipt.mjs';

const from = '0x1111111111111111111111111111111111111111';
const hash = '0x' + '44'.repeat(32), blockHash = '0x' + 'aa'.repeat(32);
function setup() {
  const values = new Map(), tails = new Map(); let writes = 0;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes++; values.set(key, value); } };
  const locks = { request: (key, options, callback) => {
    assert.equal(options.mode, 'exclusive');
    const task = (tails.get(key) ?? Promise.resolve()).then(callback);
    tails.set(key, task.catch(() => {})); return task;
  } };
  const tx = { chainId: 11155111, type: 2, from, to: shieldToken, value: '0x0', nonce: '0x0',
    gasLimit: '0x1d4c0', maxFeePerGas: '0x7d2b7500', maxPriorityFeePerGas: '0x5f5e100',
    data: encodeFunctionData({ abi: approvalAbi, functionName: 'approve', args: [shieldProxy, 1000000n] }) };
  const intent = sealShieldIntent({ reviewId: '0x' + '11'.repeat(32), quoteId: '0x' + '22'.repeat(32),
    stage: 'approval', transaction: tx, amountUnits: '1000000', receivedUnits: '997500', feeUnits: '2500', createdAt: Date.now() });
  const log = { address: shieldToken, removed: false, transactionHash: hash, blockHash, blockNumber: '0x123', transactionIndex: '0x0', logIndex: '0x0',
    topics: encodeEventTopics({ abi: approvalEventAbi, eventName: 'Approval', args: { owner: from, spender: shieldProxy, value: 1000000n } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [1000000n]) };
  const transaction = { hash, chainId: '0xaa36a7', type: '0x2', from, to: tx.to, input: tx.data, value: '0x0', nonce: '0x0',
    gas: tx.gasLimit, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    blockNumber: '0x123', blockHash, transactionIndex: '0x0' };
  const receipt = { transactionHash: hash, from, to: tx.to, status: '0x1', type: '0x2', blockNumber: '0x123', blockHash,
    transactionIndex: '0x0', gasUsed: '0x186a0', effectiveGasPrice: '0x3b9aca00', logs: [log] };
  const state = { transaction, receipt, chain: '0xaa36a7' }, calls = [];
  const provider = { request: async ({ method }) => {
    calls.push(method);
    if (method === 'eth_chainId') return state.chain;
    if (method === 'eth_getTransactionByHash') return structuredClone(state.transaction);
    if (method === 'eth_getTransactionReceipt') return structuredClone(state.receipt);
    if (method === 'eth_getBlockByNumber') return { number: '0x124', hash: blockHash };
    throw Error('Signing or unexpected RPC requested');
  } };
  // The receipt verifier asks for both the transaction's block and the head.
  const sendRead = provider.request;
  provider.request = async args => args.method === 'eth_getBlockByNumber' && args.params[0] === '0x123'
    ? (calls.push(args.method), { number: '0x123', hash: blockHash }) : sendRead(args);
  const connection = { ready: true, authenticated: true, userId: 'buyer', wallet: { address: from, getEthereumProvider: async () => provider },
    sendTransaction() { throw Error('Never sign from deposit activity'); } };
  const journalFor = id => createShieldAttemptJournal({ storage, locks, scope: shieldAttemptScope(id) });
  const journal = journalFor('buyer');
  const activity = (extra = {}) => createDepositActivity({ userId: 'buyer', getConnection: () => connection, storage, locks, ...extra });
  const seed = async (status = 'unknown', savedHash = null) => {
    await journal.claim(intent);
    if (status !== 'awaiting-wallet') await journal.update(intent.quoteId, { status, hash: savedHash });
  };
  return { values, writes: () => writes, storage, locks, intent, state, provider, calls, connection, journal, journalFor, activity, seed };
}

test('opening activity is account scoped, does not write storage and does not contact a wallet', async () => {
  const f = setup();
  assert.deepEqual(await f.activity().list(), []); assert.equal(f.writes(), 0);
  await f.seed(); const writes = f.writes();
  const rows = await f.activity().list();
  assert.equal(rows[0].statusLabel, 'Outcome unknown'); assert.equal(rows[0].canCheck, true);
  assert.deepEqual(await f.journalFor('merchant').list(), []);
  assert.equal(f.writes(), writes); assert.deepEqual(f.calls, []);
  assert.equal(JSON.stringify(rows).includes(f.intent.transaction.data), false);
});

test('reloaded activity verifies the original manual hash and persists the matching approval', async () => {
  const f = setup(); await f.seed();
  const result = await f.activity().recheck(f.intent.quoteId, hash);
  assert.equal(result.status, 'approval-confirmed'); assert.equal(result.hash, hash);
  assert.equal(result.networkFeeWei, '100000000000000');
  assert.equal(result.spendableBalanceVerified, false); assert.equal(result.merchantPayment, false);
  assert.equal((await f.activity().list())[0].status, 'approval-confirmed');
  assert.ok(f.calls.every(method => ['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByNumber'].includes(method)));
});

test('unknown, missing and nonfinal transactions remain unresolved without resending', async () => {
  const f = setup(); await f.seed(); f.state.transaction = null;
  assert.equal((await f.activity().recheck(f.intent.quoteId, hash)).status, 'unknown');
  assert.equal((await f.journal.list())[0].hash, null);
  await assert.rejects(f.journal.claim(f.intent), /unfinished/);
  const pending = setup(); await pending.seed('pending', hash); pending.state.receipt = null;
  assert.equal((await pending.activity().recheck(pending.intent.quoteId)).status, 'pending');
  await assert.rejects(pending.journal.claim(pending.intent), /unfinished/);
});

test('wrong account, funding wallet, record, hash or network cannot reconcile an attempt', async () => {
  for (const change of [f => { f.connection.userId = 'merchant'; }, f => { f.connection.wallet.address = shieldProxy; }]) {
    const f = setup(); await f.seed(); change(f);
    await assert.rejects(f.activity().recheck(f.intent.quoteId, hash)); assert.equal(f.calls.length, 0);
  }
  const f = setup(); await f.seed('pending', hash);
  await assert.rejects(f.activity().recheck('0x' + '33'.repeat(32), hash), /existing/);
  await assert.rejects(f.activity().recheck(f.intent.quoteId, 'bad'), /original/);
  await assert.rejects(f.activity().recheck(f.intent.quoteId, blockHash), /different/);
  assert.equal(f.calls.length, 0);
  f.state.chain = '0x1'; await assert.rejects(f.activity().recheck(f.intent.quoteId));
  assert.equal((await f.journal.list())[0].status, 'pending');
});

test('changed transaction terms and provider errors never replace the record or echo raw errors', async () => {
  const f = setup(); await f.seed(); const before = [...f.values.values()][0];
  f.state.transaction.input = '0x';
  await assert.rejects(f.activity().recheck(f.intent.quoteId, hash), /could not be verified/);
  f.provider.request = async () => { throw Error('secret-provider-url-and-token'); };
  await assert.rejects(f.activity().recheck(f.intent.quoteId, hash), error => !error.message.includes('secret-provider'));
  assert.equal([...f.values.values()][0], before);
});

test('account changes, closure and timeouts discard late reads before journal updates', async () => {
  for (const end of ['account', 'wallet', 'close', 'timeout']) {
    const f = setup(); await f.seed(); let finish, started;
    const called = new Promise(resolve => { started = resolve; });
    f.provider.request = () => { started(); return new Promise(resolve => { finish = resolve; }); };
    const m = f.activity({ timeoutMs: end === 'timeout' ? 15 : 1000 });
    const pending = m.recheck(f.intent.quoteId, hash); const rejected = assert.rejects(pending);
    await called;
    if (end === 'account') f.connection.authenticated = false;
    if (end === 'wallet') f.connection.wallet = { ...f.connection.wallet };
    if (end === 'close') m.close();
    if (end === 'timeout') await rejected;
    finish('0xaa36a7'); await rejected;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await f.journal.list())[0].status, 'unknown');
  }
});

test('a queued journal update rechecks account identity inside the browser lock', async () => {
  const f = setup(); await f.seed(); let release;
  const blocker = f.locks.request(`honeybee.shield-attempts.v1.${shieldAttemptScope('buyer')}`, { mode: 'exclusive' }, () => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  let current = true;
  const update = f.journal.update(f.intent.quoteId, { status: 'pending', hash }, () => { if (!current) throw Error('account changed'); });
  current = false; release(); await blocker;
  await assert.rejects(update, /account changed/);
  assert.equal((await f.journal.list())[0].hash, null);
});

test('malformed storage is preserved; unsafe display fields and declined attempts are rejected', async () => {
  const f = setup(); await f.seed();
  const { intentId: _digest, ...original } = f.intent;
  const badIntent = sealShieldIntent({ ...original, amountUnits: 'not-a-number' });
  assert.throws(() => depositActivitySummary({ intent: badIntent, status: 'unknown', hash: null }));
  const key = [...f.values.keys()][0]; f.values.set(key, '{corrupt');
  await assert.rejects(f.activity().list(), /could not be verified/); assert.equal(f.values.get(key), '{corrupt');
  const declined = setup(); await declined.seed('rejected');
  assert.equal((await declined.activity().list())[0].canCheck, false);
  await assert.rejects(declined.activity().recheck(declined.intent.quoteId, hash), /declined/);
  assert.equal(declined.calls.length, 0);
});
