import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Interface, keccak256, toUtf8Bytes } from 'ethers';
import { RailgunEngine } from '@railgun-community/engine';
import { getPublicViewingKey } from '../node_modules/@railgun-community/engine/dist/utils/keys-utils.js';
import { feeWETH, testAmountUnits } from '../../shared/test-assets.mjs';
import { prepareShieldReview, tokenInterface } from '../src/account-shield.mjs';
import { preflightShield } from '../src/shield-preflight.mjs';
import { verifyFeeToken } from '../src/fee-token.mjs';
import { walletInterface } from '../src/deployment-check.mjs';
import { validateShieldReview } from '../../checkout/src/shield-review.mjs';
import { validateShieldPreflight } from '../../checkout/src/shield-preflight.mjs';
import { createShieldAttemptJournal, shieldAttemptScope } from '../../checkout/src/shield-attempts.mjs';
import { createShieldSubmission } from '../../checkout/src/shield-submission.mjs';
import { checkShieldAttempt } from '../../checkout/src/shield-receipt.mjs';

const archive = JSON.parse(await readFile(new URL('./fixtures/sepolia-weth-runtime.json', import.meta.url)));
const wethABI = new Interface(['function symbol() view returns (string)', 'function deposit() payable', 'event Deposit(address indexed dst,uint256 wad)']);
const from = '0x1111111111111111111111111111111111111111', proxy = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea';
const hash = byte => '0x' + byte.repeat(32), hex = n => '0x' + BigInt(n).toString(16);
const reseal = (value, key) => { const body = structuredClone(value); delete body[key]; return { ...body, [key]: keccak256(toUtf8Bytes(JSON.stringify(body))) }; };
async function fixture() {
  const now = Date.now(), amount = 5_000_000_000_000_000n;
  const wallet = { id: 'synthetic-wallet', railgunAddress: RailgunEngine.encodeAddress({ masterPublicKey: 123n, viewingPublicKey: await getPublicViewingKey(new Uint8Array(32).fill(2)) }) };
  const block = { number: '0x123', hash: hash('aa'), timestamp: hex(Math.floor(now / 1000)), baseFeePerGas: hex(1000000000n) };
  const prepared = { deployment: { status: 'reviewed-deployment-and-circuit-matched', head: 'latest', chainID: 11155111, proxy,
    proxyPaused: false, verificationKeyMatches: true, blockNumber: block.number, blockHash: block.hash } };
  const state = { balance: 0n, allowance: 0n, native: 10n ** 18n, code: archive.runtimeBytecode, decimals: 18n, chain: '0xaa36a7' };
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === 'eth_chainId') return state.chain;
    if (method === 'eth_getCode') { assert.equal(params[0], feeWETH.token); return state.code; }
    if (method === 'eth_getBlockByNumber') return block;
    if (method === 'eth_getBalance') return hex(state.native);
    if (method === 'eth_maxPriorityFeePerGas') return hex(100000000n);
    if (method === 'eth_estimateGas') return hex(100000n);
    assert.equal(method, 'eth_call'); assert.equal(params.length, 2);
    const data = params[0].data;
    const abi = params[0].to === proxy ? walletInterface : wethABI.parseTransaction({ data }) ? wethABI : tokenInterface;
    const { name, args } = abi.parseTransaction({ data });
    let result;
    if (name === 'decimals') result = [state.decimals];
    else if (name === 'symbol') result = ['WETH'];
    else if (name === 'balanceOf') result = [state.balance];
    else if (name === 'allowance') result = [state.allowance];
    else if (name === 'shieldFee') result = [25n];
    else if (name === 'getFee') result = [args[0] - args[0] * 25n / 10000n, args[0] * 25n / 10000n];
    else if (name === 'approve') { assert.equal(args[0], proxy); assert.equal(args[1], amount); result = [true]; }
    else if (name === 'deposit') { assert.equal(BigInt(params[0].value), amount - state.balance); return '0x'; }
    else if (name === 'shield') { assert.ok(state.balance >= amount && state.allowance >= amount); return '0x'; }
    else throw Error('Unexpected call');
    return abi.encodeFunctionResult(name, result);
  };
  const expected = { amount: '0.005', assetId: 'fee-weth', publicAddress: from, walletId: wallet.id, privateAddress: wallet.railgunAddress };
  const { shieldReview: review } = await prepareShieldReview({ ...expected, wallet, prepared, rpc, expiresAt: now + 300000, now: () => now, checkSession() {} });
  const preflight = () => preflightShield({ review, prepared, rpc, expiresAt: now + 300000, now: () => now, checkSession() {} });
  return { review, expected, state, preflight, prepared, rpc, calls, now, amount, block };
}

test('WETH funding keeps one private note through separately simulated wrap, exact approval and shield', async () => {
  const f = await fixture();
  validateShieldReview(f.review, f.expected, f.now);
  const original = f.review.transaction.data;
  let q = (await f.preflight()).shieldPreflight;
  validateShieldPreflight(q, f.review, f.now);
  assert.equal(q.stage, 'wrap'); assert.equal(q.transaction.to, feeWETH.token);
  assert.equal(q.transaction.data, '0xd0e30db0'); assert.equal(BigInt(q.transaction.value), f.amount);
  f.state.balance = f.amount;
  q = (await f.preflight()).shieldPreflight;
  validateShieldPreflight(q, f.review, f.now);
  assert.equal(q.stage, 'approval'); assert.equal(q.transaction.to, feeWETH.token); assert.equal(q.transaction.value, '0x0');
  f.state.allowance = f.amount;
  q = (await f.preflight()).shieldPreflight;
  validateShieldPreflight(q, f.review, f.now);
  assert.equal(q.stage, 'shield'); assert.equal(q.transaction.data, original);
  assert.equal(f.review.receivedUnits, '4987500000000000');
  assert.ok(f.calls.every(c => !c.method.startsWith('eth_send')));
  assert.throws(() => validateShieldReview(f.review, { ...f.expected, assetId: 'usdc' }, f.now));
});

test('fee funding rejects changed code, decimals, network, insufficient native value plus gas and altered wrap quotes', async () => {
  for (const change of [{ code: '0x00' }, { decimals: 6n }, { chain: '0x1' }, { native: 5_000_000_000_000_000n }]) {
    const f = await fixture(); Object.assign(f.state, change); await assert.rejects(f.preflight());
  }
  const f = await fixture(), q = (await f.preflight()).shieldPreflight;
  for (const edit of [v => { v.transaction.value = hex(f.amount + 1n); }, v => { v.transaction.to = proxy; },
    v => { v.stage = 'approval'; }, v => { v.transaction.data = '0x'; }]) {
    const changed = structuredClone(q); edit(changed);
    assert.throws(() => validateShieldPreflight(reseal(changed, 'quoteId'), f.review, f.now));
  }
  assert.equal(keccak256(archive.runtimeBytecode), feeWETH.runtimeCodeHash);
  const pin = await verifyFeeToken(f.rpc, f.prepared.deployment, () => {});
  assert.equal(pin.token, feeWETH.token);
  for (const amount of ['0', '-1', '0.010000000000000001', '1e-3', '0.0000000000000000001']) assert.throws(() => testAmountUnits(amount, 'fee-weth'));
});

test('wrap confirmation persists before a wallet prompt and a matching public Deposit event is required', async () => {
  const f = await fixture(), q = (await f.preflight()).shieldPreflight, values = new Map();
  const journal = createShieldAttemptJournal({ scope: shieldAttemptScope('synthetic-account'),
    storage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
    locks: { request: (_k, _o, fn) => Promise.resolve().then(fn) } });
  let prompts = 0;
  const provider = { request: async ({ method }) => method === 'eth_chainId' ? '0xaa36a7' : method === 'eth_accounts' ? [from] : '0x0' };
  const connection = { ready: true, authenticated: true, userId: 'synthetic-account',
    wallet: { address: from, getEthereumProvider: async () => provider }, sendTransaction: async tx => {
      prompts++; assert.equal((await journal.list())[0].status, 'awaiting-wallet');
      assert.equal(BigInt(tx.value), f.amount); return { hash: hash('bb') };
    } };
  const controller = createShieldSubmission({ review: f.review, expected: f.expected, userId: connection.userId,
    getConnection: () => connection, journal, now: () => f.now, assertLiveValidation: async () => {} });
  controller.setQuote(q); await controller.confirm(q.quoteId);
  const attempt = (await journal.list())[0], tx = attempt.intent.transaction;
  const log = { address: feeWETH.token, ...wethABI.encodeEventLog(wethABI.getEvent('Deposit'), [from, f.amount]),
    removed: false, blockHash: f.block.hash, blockNumber: f.block.number, transactionHash: attempt.hash, transactionIndex: '0x0', logIndex: '0x0' };
  const request = async method => {
    if (method === 'eth_chainId') return '0xaa36a7';
    if (method === 'eth_getTransactionByHash') return { hash: attempt.hash, ...tx, chainId: '0xaa36a7', type: '0x2', input: tx.data, gas: tx.gasLimit,
      blockHash: f.block.hash, blockNumber: f.block.number, transactionIndex: '0x0' };
    if (method === 'eth_getTransactionReceipt') return { transactionHash: attempt.hash, from, to: feeWETH.token,
      type: '0x2', status: '0x1', blockHash: f.block.hash, blockNumber: f.block.number, transactionIndex: '0x0',
      gasUsed: '0x186a0', effectiveGasPrice: hex(1000000000n), logs: [log] };
    return { ...f.block, number: '0x124' };
  };
  const rpc = (method, params) => method === 'eth_getBlockByNumber' && params[0] === f.block.number ? f.block : request(method, params);
  assert.equal((await checkShieldAttempt({ attempt, request: rpc })).status, 'wrap-confirmed');
  log.address = proxy;
  await assert.rejects(checkShieldAttempt({ attempt, request: rpc }));
  await assert.rejects(controller.confirm(q.quoteId)); assert.equal(prompts, 1);
});
