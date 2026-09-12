import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, keccak256, stringToHex } from 'viem';
import { shieldAbi, approvalAbi, shieldToken, shieldProxy } from '../src/shield-review.mjs';
import { createShieldAttemptJournal, shieldAttemptScope, sealShieldIntent } from '../src/shield-attempts.mjs';
import { createShieldSubmission, reconcileShieldSubmission } from '../src/shield-submission.mjs';
import { checkShieldAttempt, shieldEventAbi, approvalEventAbi } from '../src/shield-receipt.mjs';

const from = '0x1111111111111111111111111111111111111111';
const txHash = '0x' + '44'.repeat(32), blockHash = '0x' + 'aa'.repeat(32);
const hex = value => '0x' + BigInt(value).toString(16);
const digest = (body, name) => ({ ...body, [name]: keccak256(stringToHex(JSON.stringify(body))) });
const clone = value => structuredClone(value);

function browserStore() {
  const values = new Map(), tails = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  // Deterministic Web Locks contract double, shared across recreated journals/tabs.
  const locks = { request: (name, _options, callback) => {
    const result = (tails.get(name) ?? Promise.resolve()).then(callback);
    tails.set(name, result.catch(() => {}));
    return result;
  } };
  return { storage, locks, values };
}

function fixture(stage = 'approval') {
  let time = Math.floor(Date.now() / 1000) * 1000;
  const now = () => time;
  const note = { preimage: { npk: '0x' + '11'.repeat(32), token: { tokenType: 0, tokenAddress: shieldToken, tokenSubID: 0n }, value: 1_000_000n },
    ciphertext: { encryptedBundle: Array(3).fill('0x' + '22'.repeat(32)), shieldKey: '0x' + '33'.repeat(32) } };
  const transaction = { chainId: 11155111, from, to: shieldProxy, value: '0x0', data: encodeFunctionData({ abi: shieldAbi, functionName: 'shield', args: [[note]] }) };
  const approval = { ...transaction, to: shieldToken, data: encodeFunctionData({ abi: approvalAbi, functionName: 'approve', args: [shieldProxy, 1_000_000n] }) };
  const review = digest({ version: 1, status: 'prepared-not-submitted', submissionEnabled: false,
    chainId: 11155111, network: 'Ethereum_Sepolia', token: shieldToken, walletId: 'fixture-wallet', privateAddress: '0zk-test-only', publicAddress: from,
    amountUnits: '1000000', feeBps: '25', feeUnits: '2500', receivedUnits: '997500', transaction,
    approvalRequired: true, approval, publicBalanceUnits: '20000000', allowanceUnits: '0', gasEstimate: null,
    blockNumber: '0x123', blockHash, createdAt: time, expiresAt: time + 300000 }, 'reviewId');
  const quote = (nextStage = stage) => digest({ version: 1, status: 'simulated-not-submitted', submissionEnabled: false,
    reviewId: review.reviewId, chainId: 11155111, stage: nextStage, transaction: nextStage === 'approval' ? approval : transaction,
    allowanceUnits: nextStage === 'approval' ? '0' : '1000000', publicBalanceUnits: '20000000', nativeBalanceWei: '1000000000000000000',
    gasEstimateUnits: '100000', gasLimitUnits: '120000', maxFeePerGasWei: '2100000000', maxPriorityFeePerGasWei: '100000000', maxNetworkFeeWei: '252000000000000',
    createdAt: time, expiresAt: time + 60000, blockNumber: '0x123', blockHash, blockTimestamp: hex(time / 1000) }, 'quoteId');
  const expected = { amount: '1', publicAddress: from, walletId: review.walletId, privateAddress: review.privateAddress };
  const browser = browserStore();
  const newJournal = () => createShieldAttemptJournal({ ...browser, scope: shieldAttemptScope('fixture-user') });
  const journal = newJournal();
  const providerCalls = [], sends = [];
  let chain = '0xaa36a7', accounts = [from], nonce = '0x0';
  const provider = { request: async args => {
    providerCalls.push(clone(args));
    if (args.method === 'eth_chainId') return chain;
    if (args.method === 'eth_accounts') return accounts;
    if (args.method === 'eth_getTransactionCount') return nonce;
    throw new Error('Unexpected wallet method');
  } };
  const connection = { ready: true, authenticated: true, userId: 'fixture-user',
    wallet: { address: from, getEthereumProvider: async () => provider },
    sendTransaction: async (...args) => { sends.push(clone(args)); return { hash: txHash }; } };
  const controller = (overrides = {}) => createShieldSubmission({ review, expected, userId: 'fixture-user', getConnection: () => connection,
    journal, now, assertLiveValidation: async () => {}, ...overrides });
  const intent = (q = quote()) => sealShieldIntent({ reviewId: review.reviewId, quoteId: q.quoteId, stage: q.stage,
    amountUnits: review.amountUnits, receivedUnits: review.receivedUnits, feeUnits: review.feeUnits,
    transaction: { ...q.transaction, type: 2, nonce: '0x0', gasLimit: hex(q.gasLimitUnits), maxFeePerGas: hex(q.maxFeePerGasWei), maxPriorityFeePerGas: hex(q.maxPriorityFeePerGasWei) }, createdAt: time });
  return { now, advance: delta => { time += delta; }, note, review, expected, quote, intent, journal, newJournal, browser,
    connection, controller, providerCalls, sends, network: value => { chain = value; }, accounts: value => { accounts = value; }, nonce: value => { nonce = value; } };
}

function chainFixture(f, intent = f.intent()) {
  const { transaction: expected } = intent;
  const tx = { hash: txHash, chainId: '0xaa36a7', type: '0x2', from, to: expected.to, input: expected.data,
    nonce: expected.nonce, value: '0x0', gas: expected.gasLimit, maxFeePerGas: expected.maxFeePerGas, maxPriorityFeePerGas: expected.maxPriorityFeePerGas,
    blockNumber: '0x123', blockHash, transactionIndex: '0x2', accessList: [] };
  const eventAbi = intent.stage === 'approval' ? approvalEventAbi : shieldEventAbi;
  const event = eventAbi[0];
  const args = intent.stage === 'approval' ? { owner: from, spender: shieldProxy, value: 1_000_000n }
    : { treeNumber: 0n, startPosition: 1n, commitments: [{ ...f.note.preimage, value: 997500n }], shieldCiphertext: [f.note.ciphertext], fees: [2500n] };
  const log = { address: expected.to, removed: false, blockNumber: '0x123', blockHash, transactionHash: txHash, transactionIndex: '0x2', logIndex: '0x3' };
  const receipt = { transactionHash: txHash, from, to: expected.to, type: '0x2', status: '0x1', blockNumber: '0x123', blockHash,
    transactionIndex: '0x2', gasUsed: '0x186a0', effectiveGasPrice: hex(1_000_000_000), logs: [log] };
  const encodeLog = () => {
    log.topics = encodeEventTopics({ abi: eventAbi, eventName: event.name, args });
    const inputs = event.inputs.filter(input => !input.indexed);
    log.data = encodeAbiParameters(inputs, inputs.map(input => args[input.name]));
  };
  encodeLog();
  const state = { tx, receipt, block: { hash: blockHash, number: '0x123' }, head: { hash: blockHash, number: '0x124' }, chain: '0xaa36a7', reorg: false };
  const calls = []; let blockReads = 0;
  const request = async (method, params) => {
    calls.push({ method, params });
    if (method === 'eth_chainId') return state.chain;
    if (method === 'eth_getTransactionByHash') return clone(state.tx);
    if (method === 'eth_getTransactionReceipt') return clone(state.receipt);
    if (method === 'eth_getBlockByNumber') {
      if (params[0] === 'latest' || params[0] === 'finalized') return clone(state.head);
      blockReads++;
      return clone(state.reorg && blockReads > 1 ? { ...state.block, hash: '0x' + 'bb'.repeat(32) } : state.block);
    }
    throw new Error('Unexpected RPC method');
  };
  const attempt = { intent, hash: txHash, status: 'pending' };
  return { state, calls, args, log, encodeLog, request, attempt, run: () => checkShieldAttempt({ attempt, request }) };
}

test('production gate stops before any wallet request or journal claim', async () => {
  const f = fixture(), c = f.controller({ assertLiveValidation: undefined }), q = c.setQuote(f.quote());
  await assert.rejects(c.confirm(q.quoteId), /Live Sepolia validation/);
  assert.equal(f.providerCalls.length, 0); assert.equal(f.sends.length, 0); assert.deepEqual(await f.journal.list(), []);
});

test('wallet receives exact approval, nonce and fee limits only after the attempt is persisted', async () => {
  const f = fixture(), c = f.controller(), q = c.setQuote(f.quote());
  const send = f.connection.sendTransaction;
  f.connection.sendTransaction = async (...args) => {
    const records = await f.newJournal().list();
    assert.equal(records[0].status, 'awaiting-wallet');
    assert.deepEqual(args[0], records[0].intent.transaction);
    return send(...args);
  };
  assert.equal((await c.confirm(q.quoteId)).status, 'pending');
  assert.equal(f.sends.length, 1);
  assert.deepEqual(f.sends[0][1], { address: from, sponsor: false, uiOptions: { showWalletUIs: true } });
  const persisted = [...f.browser.values.values()].join('');
  for (const forbidden of [f.review.privateAddress, f.review.walletId, 'fixture-user', 'password', 'accessToken']) assert.equal(persisted.includes(forbidden), false);
  await assert.rejects(c.confirm(q.quoteId), /unfinished transaction/);
  assert.equal(f.sends.length, 1);
});

test('concurrent controllers sharing the journal cannot create a second prompt', async () => {
  const f = fixture(), a = f.controller(), b = f.controller({ journal: f.newJournal() });
  const q = a.setQuote(f.quote()); b.setQuote(q);
  const results = await Promise.allSettled([a.confirm(q.quoteId), b.confirm(q.quoteId)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.sends.length, 1);
});

test('wrong network, expiry, wallet changes and unavailable persistence prevent signing', async () => {
  for (const change of [f => f.network('0x1'), f => f.accounts([shieldProxy]), f => f.advance(60000),
    f => { f.connection.userId = 'other-user'; }, f => { f.browser.storage.setItem = () => { throw new Error('quota'); }; }]) {
    const f = fixture(), c = f.controller(), q = c.setQuote(f.quote()); change(f);
    await assert.rejects(c.confirm(q.quoteId)); assert.equal(f.sends.length, 0);
  }
  const f = fixture(); let checks = 0;
  const c = f.controller({ assertLiveValidation: async () => { if (++checks === 2) f.nonce('0x1'); } }), q = c.setQuote(f.quote());
  assert.equal((await c.confirm(q.quoteId)).status, 'not-submitted'); assert.equal(f.sends.length, 0);
  assert.throws(() => createShieldAttemptJournal({ scope: shieldAttemptScope('x'), storage: f.browser.storage, locks: {} }), /unavailable/);
});

test('wallet rejection consumes the quote; timeout or malformed response blocks new attempts after reload', async () => {
  for (const failure of ['reject', 'timeout', 'bad-hash']) {
    const f = fixture(), c = f.controller(), q = c.setQuote(f.quote());
    f.connection.sendTransaction = async () => {
      if (failure === 'bad-hash') return { hash: 'bad' };
      throw failure === 'reject' ? Object.assign(new Error('rejected'), { code: 4001 }) : new Error('timeout');
    };
    assert.equal((await c.confirm(q.quoteId)).status, failure === 'reject' ? 'rejected' : 'unknown');
    await assert.rejects(c.confirm(q.quoteId));
    f.advance(1000);
    const resumed = f.controller({ journal: f.newJournal() }), next = resumed.setQuote(f.quote());
    if (failure !== 'reject') await assert.rejects(resumed.confirm(next.quoteId), /unfinished transaction/);
    else assert.equal((await resumed.confirm(next.quoteId)).status, 'rejected');
  }
});

test('late hash survives logout and quote expiry; persistence failure retains the hash for recovery', async () => {
  for (const failStorage of [false, true]) {
    const f = fixture(), c = f.controller(), q = c.setQuote(f.quote());
    f.connection.sendTransaction = async () => {
      f.connection.authenticated = false; f.advance(400000);
      if (failStorage) f.browser.storage.setItem = () => { throw new Error('quota'); };
      return { hash: txHash };
    };
    const outcome = await c.confirm(q.quoteId);
    assert.equal(outcome.hash, txHash); assert.equal(outcome.status, failStorage ? 'unknown' : 'pending');
    if (failStorage) assert.equal(outcome.storageError, true);
    assert.equal(c.outcome().hash, txHash);
    await assert.rejects(c.confirm(q.quoteId));
    assert.equal(c.outcome().hash, txHash, 'A blocked new click must retain the unpersisted late hash');
  }
});

test('approval confirmation and a fresh deposit quote require two distinct user actions', async () => {
  const f = fixture(), approvalChain = chainFixture(f), c = f.controller({ request: approvalChain.request });
  const first = c.setQuote(f.quote()); await c.confirm(first.quoteId);
  assert.equal((await c.recheck(first.quoteId)).status, 'approval-confirmed');
  assert.equal(f.sends.length, 1, 'No automatic deposit after approval');
  f.advance(1000);
  const second = c.setQuote(f.quote('shield'));
  await c.confirm(second.quoteId);
  assert.equal(f.sends.length, 2);
  assert.equal(f.sends[1][0].data, f.review.transaction.data, 'The original randomized note is preserved');
});

test('read-only verifier waits for the appropriate confirmation policy and handles canonical reverts', async () => {
  for (const stage of ['approval', 'shield']) {
    const f = fixture(stage), chain = chainFixture(f);
    assert.equal((await chain.run()).status, stage === 'approval' ? 'approval-confirmed' : 'deposit-confirmed');
    assert.equal((await chain.run()).spendableBalanceVerified, false);
    assert.equal((await chain.run()).merchantPayment, false);
    chain.state.head.number = '0x122'; assert.equal((await chain.run()).status, 'pending');
    chain.state.head.number = '0x124'; chain.state.receipt.status = '0x0'; chain.state.receipt.logs = [];
    assert.equal((await chain.run()).status, 'reverted');
    assert.equal(chain.calls.some(c => /send|sign/i.test(c.method)), false);
  }
});

test('receipt checks reject changed transaction, event, fee, note, block and replacement data', async () => {
  const mutations = [
    c => { c.state.chain = '0x1'; }, c => { c.state.tx.from = shieldProxy; }, c => { c.state.tx.to = from; },
    c => { c.state.tx.input = '0x'; }, c => { c.state.tx.nonce = '0x1'; }, c => { c.state.tx.gas = '0x1'; },
    c => { c.state.tx.maxFeePerGas = '0x1'; }, c => { c.state.tx.type = '0x4'; }, c => { c.state.tx.accessList = [{}]; },
    c => { c.log.removed = true; }, c => { c.log.address = from; }, c => { c.log.blockHash = txHash; },
    c => { c.log.transactionHash = blockHash; }, c => { c.state.receipt.logs.push(clone(c.log)); },
    c => { c.state.receipt.effectiveGasPrice = hex(99_000_000_000); }, c => { c.state.block.hash = txHash; },
    c => { c.state.head = null; }, c => { c.state.reorg = true; },
    c => { c.args.commitments[0].npk = txHash; c.encodeLog(); },
    c => { c.args.commitments[0].value = 1_000_000n; c.encodeLog(); },
    c => { c.args.fees[0] = 0n; c.encodeLog(); },
    c => { c.args.shieldCiphertext[0].shieldKey = txHash; c.encodeLog(); },
    c => { c.args.shieldCiphertext[0].encryptedBundle[0] = txHash; c.encodeLog(); },
    c => { c.log.data += '00'.repeat(32); },
  ];
  for (const mutate of mutations) { const f = fixture('shield'), c = chainFixture(f); mutate(c); await assert.rejects(c.run()); }
  const f = fixture(), c = chainFixture(f); c.args.value = 2_000_000n; c.encodeLog(); await assert.rejects(c.run());
  await assert.rejects(checkShieldAttempt({ attempt: c.attempt, hash: blockHash, request: c.request }), /Replacement/);
});

test('missing and pending transactions never unlock another deposit or adopt an unverified manual hash', async () => {
  const f = fixture('shield'), c = chainFixture(f);
  c.state.receipt = null; assert.equal((await c.run()).status, 'pending');
  c.state.tx = null; assert.equal((await c.run()).status, 'unknown');
  const noHash = { ...c.attempt, hash: null, status: 'unknown' };
  const result = await checkShieldAttempt({ attempt: noHash, hash: txHash, request: c.request });
  assert.equal(result.hash, null);
});

test('reconciliation works from the persisted public intent after the private review expires', async () => {
  const f = fixture('shield'), c = chainFixture(f);
  await f.journal.claim(c.attempt.intent);
  await f.journal.update(c.attempt.intent.quoteId, { status: 'unknown', hash: null });
  f.advance(24 * 60 * 60 * 1000);
  const restored = f.newJournal();
  const result = await reconcileShieldSubmission({ journal: restored, quoteId: c.attempt.intent.quoteId, hash: txHash,
    request: c.request, assertCurrent: () => assert.equal(f.connection.userId, 'fixture-user') });
  assert.equal(result.status, 'deposit-confirmed');
  assert.equal((await restored.list())[0].hash, txHash);
  await assert.rejects(restored.claim(c.attempt.intent), /already attempted/);
});

test('corrupt storage and sensitive intent fields fail closed; terminal records cannot be reset', async () => {
  const f = fixture();
  const extra = sealShieldIntent({ ...f.intent(), password: 'must-never-persist' });
  await assert.rejects(f.journal.claim(extra));
  await f.journal.claim(f.intent());
  await f.journal.update(f.quote().quoteId, { status: 'pending', hash: txHash });
  await assert.rejects(f.journal.update(f.quote().quoteId, { status: 'not-submitted' }));
  await f.journal.update(f.quote().quoteId, { status: 'approval-confirmed', hash: txHash });
  await assert.rejects(f.journal.update(f.quote().quoteId, { status: 'unknown' }));
  const key = [...f.browser.values.keys()][0]; f.browser.values.set(key, '{bad-json');
  await assert.rejects(f.newJournal().claim(f.intent()));
});
