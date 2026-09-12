import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Interface, keccak256, toUtf8Bytes } from 'ethers';
import { walletInterface } from '../src/deployment-check.mjs';
import { tokenInterface } from '../src/account-shield.mjs';
import { accountSyncToken } from '../src/account-sync.mjs';
import { preflightShield } from '../src/shield-preflight.mjs';
import { createShieldReviewCache } from '../src/shield-review-cache.mjs';
import { createAccountWalletClient } from '../../checkout/src/account-client.mjs';
import { validateShieldPreflight, shieldConfirmationStep } from '../../checkout/src/shield-preflight.mjs';

const proxy = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea';
const from = '0x1111111111111111111111111111111111111111';
const stateABI = new Interface(['function paused() view returns (bool)', 'function isBlacklisted(address) view returns (bool)']);
const digest = (value, field) => { const body = { ...value }; delete body[field]; return { ...body, [field]: keccak256(toUtf8Bytes(JSON.stringify(body))) }; };
const hex = value => '0x' + BigInt(value).toString(16);
function fixture(change = {}) {
  const now = change.now ?? Date.now();
  // Synthetic unsigned note for preflight control tests; no proof or funds.
  const request = { preimage: { npk: '0x' + '11'.repeat(32), token: { tokenType: 0, tokenAddress: accountSyncToken, tokenSubID: 0 }, value: 1_000_000n },
    ciphertext: { encryptedBundle: Array(3).fill('0x' + '22'.repeat(32)), shieldKey: '0x' + '33'.repeat(32) } };
  const transaction = { chainId: 11155111, from, to: proxy, value: '0x0', data: walletInterface.encodeFunctionData('shield', [[request]]) };
  const review = digest({ version: 1, status: 'prepared-not-submitted', submissionEnabled: false,
    chainId: 11155111, network: 'Ethereum_Sepolia', token: accountSyncToken, walletId: 'fixture-wallet', privateAddress: '0zk-test-only',
    publicAddress: from, amountUnits: '1000000', feeBps: '25', feeUnits: '2500', receivedUnits: '997500', transaction,
    createdAt: now, expiresAt: now + 300000 }, 'reviewId');
  const block = { number: '0x1234', hash: '0x' + 'aa'.repeat(32), timestamp: hex(Math.floor(now / 1000) - (change.stale ? 120 : 0)), baseFeePerGas: hex(1_000_000_000) };
  const prepared = { deployment: { status: 'reviewed-deployment-and-circuit-matched', head: 'latest', chainID: 11155111,
    proxy, proxyPaused: false, verificationKeyMatches: true, blockNumber: block.number, blockHash: block.hash } };
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params: structuredClone(params) }); change.onCall?.(method);
    if (method === 'eth_getBlockByNumber') return change.reorg && calls.length > 1 ? { ...block, hash: '0x' + 'bb'.repeat(32) } : block;
    if (method === 'eth_maxPriorityFeePerGas') return change.badPriority ?? hex(100_000_000);
    assert.equal(params.at(-1), block.number, 'Reads and simulations share the exact inspected block');
    if (method === 'eth_getBalance') return hex(change.nativeBalance ?? 10n ** 18n);
    if (method === 'eth_estimateGas') {
      if (change.estimateFailure) throw new Error('estimate failed');
      return hex(change.estimate ?? 80001);
    }
    assert.equal(method, 'eth_call'); assert.equal(params.length, 2, 'No state overrides');
    const { to, data } = params[0];
    let abi = to === proxy ? walletInterface : tokenInterface;
    if (to === accountSyncToken && stateABI.parseTransaction({ data })) abi = stateABI;
    const { name, args } = abi.parseTransaction({ data });
    let values;
    if (name === 'decimals') values = [change.decimals ?? 6];
    else if (name === 'paused') values = [!!change.paused];
    else if (name === 'isBlacklisted') values = [!!change.blacklisted];
    else if (name === 'balanceOf') values = [change.balance ?? 20_000_000n];
    else if (name === 'allowance') values = [change.allowance ?? 0n];
    else if (name === 'shieldFee') values = [change.feeBps ?? 25n];
    else if (name === 'getFee') { const fee = args[0] * args[2] / 10000n; values = [args[0] - fee, fee]; }
    else if (name === 'approve') { assert.equal(args[0], proxy); assert.equal(args[1], 1_000_000n); values = [!change.approvalFalse]; }
    else if (name === 'shield') {
      assert.equal(data, review.transaction.data);
      if (change.shieldFailure) throw new Error('simulation reverted');
      return '0x';
    } else throw new Error('Unexpected method');
    return abi.encodeFunctionResult(name, values);
  };
  const run = (extra = {}) => preflightShield({ review, prepared, rpc, expiresAt: now + 300000, now: () => now, checkSession: () => {}, ...extra });
  return { now, review, prepared, rpc, calls, run };
}

test('approval simulation quotes only the exact approval and waits for allowance before quoting the deposit', async () => {
  const approval = fixture();
  const first = await approval.run();
  assert.equal(first.shieldPreflight.stage, 'approval');
  validateShieldPreflight(first.shieldPreflight, approval.review, approval.now);
  assert.equal(first.shieldPreflight.transaction.data, tokenInterface.encodeFunctionData('approve', [proxy, 1_000_000n]));
  assert.equal(approval.calls.some(c => c.params[0]?.data === approval.review.transaction.data), false);
  const deposit = fixture({ allowance: 1_000_000n });
  const second = await deposit.run();
  assert.equal(second.shieldPreflight.stage, 'shield');
  assert.deepEqual(second.shieldPreflight.transaction, deposit.review.transaction);
  assert.equal(deposit.calls.some(c => c.method === 'eth_call' && c.params[0]?.data === deposit.review.transaction.data), true);
  assert.equal(second.shieldPreflight.submissionEnabled, false);
  assert.equal(second.shieldReview.reviewId, deposit.review.reviewId);
});

test('changed protocol state, failed simulation, stale blocks and insufficient funds reject fee quotes', async () => {
  for (const change of [{ feeBps: 50n }, { decimals: 18 }, { paused: true }, { blacklisted: true },
    { balance: 999999n }, { nativeBalance: 1n }, { approvalFalse: true }, { estimateFailure: true },
    { allowance: 1_000_000n, shieldFailure: true }, { reorg: true }, { stale: true },
    { estimate: 1 }, { estimate: 2_000_000 }, { badPriority: '0x' }, { badPriority: hex(51_000_000_000) }]) {
    await assert.rejects(fixture(change).run());
  }
  const f = fixture();
  await assert.rejects(f.run({ expiresAt: f.now }));
  await assert.rejects(f.run({ prepared: { deployment: { ...f.prepared.deployment, head: 'finalized' } } }));
  const altered = structuredClone(f.review); altered.transaction.to = from;
  await assert.rejects(f.run({ review: digest(altered, 'reviewId') }));
  let live = true;
  const expired = fixture({ onCall: () => { live = false; } });
  await assert.rejects(expired.run({ checkSession: () => { if (!live) throw new Error('expired'); } }), /expired/);
});

test('fee ceilings round up and cover estimated execution across 1000 bounded gas samples', async () => {
  for (let i = 0; i < 1000; i++) {
    const estimate = randomInt(21000, 1_666_666);
    const { shieldPreflight: q } = await fixture({ estimate }).run();
    const gas = BigInt(q.gasLimitUnits), required = BigInt(estimate) * 120n;
    assert.ok(gas * 100n >= required);
    assert.ok((gas - 1n) * 100n < required);
    assert.ok(BigInt(q.maxNetworkFeeWei) >= BigInt(estimate) * BigInt(q.maxFeePerGasWei));
  }
});

test('frontend rejects changed quotes and expires the confirmation preview before any wallet action', async () => {
  const f = fixture(), { shieldPreflight: quote } = await f.run();
  const args = { review: f.review, quote, publicAddress: from, chainId: 'eip155:11155111', now: f.now };
  assert.equal(shieldConfirmationStep(args), 'approval');
  assert.equal(shieldConfirmationStep({ ...args, chainId: 'eip155:1' }), 'switch-network');
  assert.equal(shieldConfirmationStep({ ...args, now: quote.expiresAt }), 'check-fee');
  assert.equal(shieldConfirmationStep({ ...args, publicAddress: proxy }), 'review');
  assert.equal(shieldConfirmationStep({ ...args, now: f.review.expiresAt }), 'review');
  for (const change of [q => { q.maxNetworkFeeWei = '1'; }, q => { q.transaction.to = from; },
    q => { q.stage = 'shield'; }, q => { q.reviewId = 'another-review'; }, q => { q.submissionEnabled = true; },
    q => { q.gasLimitUnits = q.gasEstimateUnits; }, q => { q.expiresAt += 1000; }]) {
    const altered = structuredClone(quote); change(altered);
    assert.throws(() => validateShieldPreflight(digest(altered, 'quoteId'), f.review, f.now));
  }
});

test('review cache binds owners, rejects expired/replaced requests and never accepts caller changes', async () => {
  let now = Date.now();
  const a = { ownerId: 'a'.repeat(64), expiresAt: now + 3600000 }, b = { ...a, ownerId: 'b'.repeat(64) };
  const cache = createShieldReviewCache({ now: () => now, maximum: 1 });
  const { review } = fixture({ now });
  cache.put(a, review);
  await assert.rejects(cache.use(b, review.reviewId, () => assert.fail('No other owner access')));
  assert.throws(() => cache.put(b, review), /Invalid stored/);
  await cache.use(a, review.reviewId, value => { value.transaction.to = from; });
  await cache.use(a, review.reviewId, value => assert.equal(value.transaction.to, proxy));
  let release;
  const pending = cache.use(a, review.reviewId, () => new Promise(resolve => { release = resolve; }));
  await assert.rejects(cache.use(a, review.reviewId, () => {}), /already running/);
  cache.discard(a); release(); await assert.rejects(pending, /expired or replaced/);
  cache.put(a, review); now = review.expiresAt;
  await assert.rejects(cache.use(a, review.reviewId, () => {}), /expired or replaced/);
  const restarted = createShieldReviewCache();
  await assert.rejects(restarted.use(a, review.reviewId, () => {}));
});

test('local client requests only a cached review ID and rejects changed-account or partial fee responses', async () => {
  const f = fixture(), quote = await f.run();
  const response = { ...quote, account: { authenticated: true }, network: 'Ethereum_Sepolia', paymentReady: false,
    networkLoaded: false, spendableBalanceVerified: false, privateWallet: { status: 'locked', id: f.review.walletId, privateAddress: f.review.privateAddress },
    identityVerification: { verified: false, status: 'deferred-for-testnet' } };
  let next = response, current = true, changeAccount = false, calls = 0;
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture-token', isCurrent: () => current,
    fetchImpl: async (_url, options) => {
      calls++; assert.deepEqual(JSON.parse(options.body), { action: 'shield-preflight', reviewId: f.review.reviewId });
      if (changeAccount) current = false;
      return new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } });
    } });
  assert.equal((await client.preflight(f.review)).shieldPreflight.stage, 'approval');
  next = { ...response, shieldPreflight: undefined };
  await assert.rejects(client.preflight(f.review), /could not be verified/);
  next = response; changeAccount = true;
  await assert.rejects(client.preflight(f.review), /account changed/);
  assert.equal(calls, 3, 'No automatic retries');
});

test('real fee-check worker rejects a wrong-chain RPC without opening account storage or receiving a password', { timeout: 15000 }, async t => {
  const methods = [];
  const rpc = createServer((req, res) => {
    const chunks = []; req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const request = JSON.parse(Buffer.concat(chunks)); methods.push(request.method);
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x1' }));
    });
  });
  await new Promise(resolve => rpc.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => rpc.close(resolve)));
  const child = fork(fileURLToPath(new URL('../src/account-wallet-worker.mjs', import.meta.url)), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); });
  const completed = new Promise((resolve, reject) => { child.once('exit', (code, signal) => resolve({ code, signal })); child.once('error', reject); });
  child.send({ action: 'shield-preflight', session: { ownerId: 'a'.repeat(64), expiresAt: Date.now() + 300000 },
    review: fixture().review, syncConfig: { rpcURL: `http://127.0.0.1:${rpc.address().port}` } });
  assert.deepEqual(await completed, { code: 1, signal: null });
  assert.deepEqual(methods, ['eth_chainId']);
});
