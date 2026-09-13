import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { encodeFunctionData, erc20Abi } from 'viem';
import { generateKeyPair, SignJWT } from 'jose';
import { authenticate, APP_ID } from '../server/auth.mjs';
import { CHAIN_ID, USDC } from '../src/payment.mjs';
import { FIRST_PAYMENT, createIntent, registerHash, reconcile, totals, verifyCountablePayment } from '../server/payment-count.mjs';
import { createHandler } from '../server/index.mjs';

function db() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(`../drizzle/${f}`, import.meta.url), 'utf8'));
  return { prepare(sql) {
    const stmt = sqlite.prepare(sql);
    return { bind(...values) { return { first: async () => stmt.get(...values), all: async () => ({ results: stmt.all(...values) }), run: async () => ({ meta: stmt.run(...values) }) }; },
      first: async () => stmt.get(), all: async () => ({ results: stmt.all() }) };
  } };
}
const hash = '0x' + 'a'.repeat(64), blockHash = '0x' + 'b'.repeat(64);
const now = Date.parse('2026-09-10T15:00:00Z');
const input = { sender: FIRST_PAYMENT.sender, recipient: FIRST_PAYMENT.recipient, amount: '1', expiresAt: now + 300000 };
const row = { sender: input.sender, recipient: input.recipient, amount_units: '1000000', created_at: now, expires_at: now + 300000, after_block: 20000000 };
function fixture(r, h) {
  const block = { number: BigInt(r.after_block) + 1n, hash: blockHash, timestamp: BigInt(Math.floor(r.created_at / 1000) + 12) };
  const topic = a => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
  const log = { address: USDC, transactionHash: h, blockHash, blockNumber: block.number, removed: false,
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', topic(r.sender), topic(r.recipient)],
    data: '0x' + BigInt(r.amount_units).toString(16).padStart(64, '0') };
  return { block, receipt: { status: 'success', transactionHash: h, blockHash, blockNumber: block.number, logs: [log] },
    tx: { hash: h, blockHash, blockNumber: block.number, from: r.sender, to: USDC, value: 0n,
      input: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [r.recipient, BigInt(r.amount_units)] }) } };
}
function rpc(changes = {}) {
  const fixtures = { [hash]: fixture(row, hash), [FIRST_PAYMENT.tx_hash]: fixture(FIRST_PAYMENT, FIRST_PAYMENT.tx_hash) };
  return {
    getChainId: async () => CHAIN_ID, getBlockNumber: async () => 20000050n,
    getBlock: async ({ blockTag, blockNumber }) => blockTag ? { number: 30000000n } : Object.values(fixtures).find(f => f.block.number === blockNumber).block,
    getTransactionReceipt: async ({ hash: h }) => fixtures[h].receipt,
    getTransaction: async ({ hash: h }) => fixtures[h].tx,
    getLogs: async () => [{ transactionHash: hash, args: { value: 1000000n } }], ...changes,
  };
}
test('counter validates finality, exact transfer, approval timing, network and canonical block', async () => {
  assert.equal((await verifyCountablePayment(row, hash, rpc())).hash, hash);
  assert.equal(await verifyCountablePayment(row, hash, rpc({ getBlock: async () => ({ number: 1n }) })), null);
  const f = fixture(row, hash);
  for (const overrides of [
    { getChainId: async () => 1 },
    { getTransaction: async () => ({ ...f.tx, from: row.recipient }) },
    { getTransaction: async () => ({ ...f.tx, input: '0x' }) },
    { getTransactionReceipt: async () => ({ ...f.receipt, status: 'reverted' }) },
    { getTransactionReceipt: async () => ({ ...f.receipt, blockHash: hash }) },
    { getTransactionReceipt: async () => ({ ...f.receipt, logs: [f.receipt.logs[0], f.receipt.logs[0]] }) },
  ]) await assert.rejects(verifyCountablePayment(row, hash, rpc(overrides)));
  await assert.rejects(verifyCountablePayment({ ...row, expires_at: now + 1000 }, hash, rpc()));
  await assert.rejects(verifyCountablePayment({ ...row, after_block: row.after_block + 1 }, hash, rpc()));
});
test('durable count survives duplicate reports, rejects another account, and recovers an unreported hash', async () => {
  const store = db(); const provider = rpc({ getBlockNumber: async () => BigInt(row.after_block) });
  const a = await createIntent(store, 'owner', input, provider, now);
  await assert.rejects(registerHash(store, 'other-owner', a.id, hash));
  await registerHash(store, 'owner', a.id, hash);
  await registerHash(store, 'owner', a.id, hash);
  assert.equal((await totals(store)).testPayments, 0);
  await reconcile(store, rpc(), now + 1000000);
  assert.equal((await totals(store)).testPayments, 2); // reviewed historical + new payment
  const b = await createIntent(store, 'owner', input, provider, now);
  await registerHash(store, 'owner', b.id, hash);
  await reconcile(store, rpc(), now + 1100000);
  assert.equal((await totals(store)).testPayments, 2); // UNIQUE finalized hash
  const fresh = db();
  await createIntent(fresh, 'owner', input, provider, now);
  await reconcile(fresh, rpc(), now + 1000000); // no submission callback
  assert.equal((await totals(fresh)).testPayments, 2);
  assert.deepEqual(Object.keys(await totals(fresh)).sort(), ['finality', 'network', 'testPayments']);
});
test('no click or rejected attempt counts, and per-account registration is bounded', async () => {
  const store = db(); const provider = rpc({ getBlockNumber: async () => BigInt(row.after_block) });
  await assert.rejects(createIntent(store, 'owner', { ...input, recipient: input.sender }, provider, now));
  await assert.rejects(createIntent(store, 'owner', { ...input, amount: '20' }, provider, now));
  for (let i = 0; i < 20; i++) await createIntent(store, 'owner', input, provider, now);
  await assert.rejects(createIntent(store, 'owner', input, provider, now), /Too many/);
  await reconcile(store, rpc({ getLogs: async () => [] }), now + 1000000);
  assert.equal((await totals(store)).testPayments, 1);
});
test('signed access tokens require this app, unexpired sessions and the pinned signing key', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwt = aud => new SignJWT({ sid: 'session' }).setProtectedHeader({ alg: 'ES256', typ: 'JWT' }).setSubject('did:privy:test-user').setIssuer('privy.io').setAudience(aud).setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const request = token => new Request('https://honeybee.test/api/payment-intents', { headers: { authorization: `Bearer ${token}` } });
  assert.match(await authenticate(request(await jwt(APP_ID)), publicKey), /^[a-f0-9]{64}$/);
  await assert.rejects(authenticate(request(await jwt('other-app')), publicKey));
  await assert.rejects(authenticate(request(await jwt(APP_ID)), (await generateKeyPair('ES256')).publicKey));
  await assert.rejects(authenticate(request('invalid'), publicKey));
});
test('API rejects cross-origin and unauthenticated writes and exposes aggregate data only', async () => {
  const handler = createHandler({ auth: async () => { throw Error('secret-token'); }, reconcilePayments: async () => {} });
  const store = db();
  const cross = await handler(new Request('https://honeybee.test/api/payment-intents', { method: 'POST', headers: { origin: 'https://other.test' } }), { DB: store });
  assert.equal(cross.status, 403);
  const missing = await handler(new Request('https://honeybee.test/api/payment-intents', { method: 'POST', headers: { origin: 'https://honeybee.test', 'content-type': 'application/json' }, body: '{}' }), { DB: store });
  assert.equal(missing.status, 401); assert.doesNotMatch(await missing.text(), /secret-token/);
  const response = await handler(new Request('https://honeybee.test/api/payment-count'), { DB: store });
  assert.deepEqual(await response.json(), { testPayments: 0, network: 'sepolia', finality: 'finalized' });
});
