import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, stat, readdir, rm, chmod, symlink, link, mkdir } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RailgunEngine } from '@railgun-community/engine';
import { createAccountInvoice, invoiceValidation } from '../src/account-invoice.mjs';
import { createRequestHistoryStore, requestHistoryFilename, requestHistoryFileLimit } from '../src/request-history.mjs';
import { privateRequestHistory, requestHistoryLimit } from '../../shared/private-request-history.mjs';
import { validatePaymentRequestHistory, paymentRequestFile, readPaymentRequest } from '../../checkout/src/private-request.mjs';
import { createAccountWalletClient } from '../../checkout/src/account-client.mjs';

const initialTime = 1800000000;
const recipient = RailgunEngine.encodeAddress({ masterPublicKey: 123n, viewingPublicKey: new Uint8Array(32).fill(2) });
const otherRecipient = RailgunEngine.encodeAddress({ masterPublicKey: 456n, viewingPublicKey: new Uint8Array(32).fill(3) });
const invoice = (options = {}) => createAccountInvoice({ wallet: { id: 'test-wallet-id', railgunAddress: recipient },
  amount: '1', lifetimeSeconds: 900, now: initialTime, checkSession() {}, ...options }).paymentRequest;
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'honeybee-history-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const context = { directory, recipient, ownerId: randomBytes(32).toString('hex'),
    privateKey: '0x' + randomBytes(32).toString('hex'), now: () => initialTime, checkSession() {} };
  return { context, filename: join(directory, requestHistoryFilename), store: createRequestHistoryStore(context) };
}

test('history survives reopening, encrypts private terms, preserves duplicate records and uses fresh encryption', async t => {
  const { context, filename, store } = await fixture(t), first = invoice();
  assert.equal((await store.read()).requests.length, 0);
  assert.deepEqual(await readdir(context.directory), []);
  await store.append(first);
  const saved = await readFile(filename, 'utf8'), envelope = JSON.parse(saved);
  for (const secret of [first.recipient, first.id, 'amountUnits', context.ownerId, context.privateKey.slice(2)]) assert.equal(saved.includes(secret), false);
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.equal((await createRequestHistoryStore(context).read()).requests[0].digest, first.digest);
  assert.equal((await store.append(first)).requests.length, 1);
  assert.equal(await readFile(filename, 'utf8'), saved);
  await store.append(invoice({ amount: '2' }));
  const next = JSON.parse(await readFile(filename, 'utf8'));
  assert.notEqual(next.salt, envelope.salt); assert.notEqual(next.iv, envelope.iv);
  assert.equal((await store.read()).requests.length, 2);
  assert.deepEqual(await readdir(context.directory), [requestHistoryFilename]);
});

test('history rejects another account, root key or recovered recipient without changing ciphertext', async t => {
  const { context, filename, store } = await fixture(t); await store.append(invoice());
  const saved = await readFile(filename, 'utf8');
  for (const change of [{ ownerId: randomBytes(32).toString('hex') }, { privateKey: '0x' + randomBytes(32).toString('hex') }, { recipient: otherRecipient }]) {
    const wrong = createRequestHistoryStore({ ...context, ...change });
    await assert.rejects(wrong.read()); await assert.rejects(wrong.append(invoice()));
    assert.equal(await readFile(filename, 'utf8'), saved);
  }
});

test('malformed, tampered and oversized history fail closed instead of resetting existing data', async t => {
  const { filename, store } = await fixture(t); await store.append(invoice());
  const saved = await readFile(filename, 'utf8'), envelope = JSON.parse(saved);
  const changed = value => value[0] === 'a' ? 'b' + value.slice(1) : 'a' + value.slice(1);
  const broken = ['', '{', 'x'.repeat(requestHistoryFileLimit + 1), JSON.stringify({ ...envelope, version: 2 }),
    JSON.stringify({ ...envelope, ownerId: 'injected' }), ...['salt', 'iv', 'tag', 'ciphertext'].map(key => JSON.stringify({ ...envelope, [key]: changed(envelope[key]) }))];
  for (const text of broken) {
    await writeFile(filename, text); await assert.rejects(store.read()); await assert.rejects(store.append(invoice()));
    assert.equal(await readFile(filename, 'utf8'), text);
  }
  await writeFile(filename, saved); assert.equal((await store.read()).requests.length, 1);
});

test('unsafe files and directories, hard links and dangling symlinks are refused', async t => {
  const { context, filename, store } = await fixture(t); await store.append(invoice());
  await chmod(filename, 0o644); await assert.rejects(store.read()); await assert.rejects(store.append(invoice())); await chmod(filename, 0o600);
  const other = join(context.directory, 'other'); await link(filename, other); await assert.rejects(store.read()); await rm(other);
  await rm(filename); await symlink(join(context.directory, 'missing'), filename); await assert.rejects(store.read()); await assert.rejects(store.append(invoice()));
  await rm(filename); await mkdir(filename); await assert.rejects(store.read()); await rm(filename, { recursive: true });
  await chmod(context.directory, 0o755); await assert.rejects(store.append(invoice())); await chmod(context.directory, 0o700);
});

test('interrupted pre-rename writes preserve old history and clean temporary files', async t => {
  const { context, filename, store } = await fixture(t); await store.append(invoice());
  const saved = await readFile(filename, 'utf8');
  const interrupted = createRequestHistoryStore({ ...context, checkSession() {
    if (readdirSync(context.directory).some(name => name.endsWith('.tmp'))) throw new Error('Session ended');
  } });
  await assert.rejects(interrupted.append(invoice()), /Session ended/);
  assert.equal(await readFile(filename, 'utf8'), saved);
  assert.deepEqual(await readdir(context.directory), [requestHistoryFilename]);
});

test('a lost response after commit can be recovered from history without creating another request', async t => {
  const { context, filename, store } = await fixture(t); await store.append(invoice());
  const saved = await readFile(filename, 'utf8'), next = invoice();
  const interrupted = createRequestHistoryStore({ ...context, checkSession() {
    if (readFileSync(filename, 'utf8') !== saved) throw new Error('Session ended after save');
  } });
  await assert.rejects(interrupted.append(next), /Session ended after save/);
  const recovered = await store.read(); assert.equal(recovered.requests.length, 2);
  assert.equal(recovered.requests.some(request => request.id === next.id), true);
});

test('historical expiry never makes an expired request importable, downloadable or paid', async t => {
  const { context, store } = await fixture(t), request = invoice();
  const file = paymentRequestFile(request, initialTime); await store.append(request);
  const now = request.expiresAt;
  const history = await createRequestHistoryStore({ ...context, now: () => now }).read();
  const validated = validatePaymentRequestHistory(history, { recipient, now });
  assert.equal(validated.paymentStatus, 'not-checked'); assert.ok(Object.isFrozen(validated.requests));
  assert.throws(() => paymentRequestFile(validated.requests[0], now));
  assert.throws(() => readPaymentRequest(file, now));
  for (const value of [{ ...history, paymentStatus: 'paid' }, { ...history, transactionHash: 'fake' },
    { ...history, requests: [...history.requests, ...history.requests] }, { ...history, source: 'browser-storage' }]) {
    assert.throws(() => validatePaymentRequestHistory(value, { recipient, now }));
  }
});

test('full history and conflicting request IDs fail without dropping existing records', async t => {
  const { context, filename, store } = await fixture(t), first = invoice(); await store.append(first);
  const saved = await readFile(filename, 'utf8');
  const changed = { ...first, amountUnits: '2000000' };
  const { digest, ...body } = changed; changed.digest = invoiceValidation(initialTime).hash(JSON.stringify(body));
  await assert.rejects(store.append(changed)); assert.equal(await readFile(filename, 'utf8'), saved);
  for (let index = 1; index < requestHistoryLimit; index++) await store.append(invoice());
  const full = await readFile(filename, 'utf8');
  await assert.rejects(store.append(invoice()), /128-request test limit/);
  assert.equal(await readFile(filename, 'utf8'), full);
  assert.equal((await createRequestHistoryStore(context).read()).requests.length, 128);
});

test('client rejects unpersisted creation, misleading history and late account responses without retrying', async () => {
  const now = Math.floor(Date.now() / 1000), request = invoice({ now });
  const history = privateRequestHistory([request], { ...invoiceValidation(now), recipient });
  const base = { account: { authenticated: true }, network: 'Ethereum_Sepolia', paymentReady: false,
    identityVerification: { status: 'deferred-for-testnet', verified: false }, networkLoaded: false, spendableBalanceVerified: false,
    privateWallet: { status: 'locked', id: 'fixture', privateAddress: recipient }, requestHistory: history, paymentRequest: request };
  let response = base, current = true, calls = 0, late = false;
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture', isCurrent: () => current,
    fetchImpl: async () => { calls++; if (late) current = false; return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } }); } });
  assert.equal((await client.execute('invoice-history')).requestHistory.requests.length, 1);
  for (const value of [{ ...history, requests: [] }, { ...history, paymentStatus: 'paid' }, undefined]) {
    response = { ...base, requestHistory: value }; const before = calls;
    await assert.rejects(client.execute('invoice-create', { amount: '1', lifetimeSeconds: 900 }), /open request history before trying again/);
    assert.equal(calls, before + 1);
  }
  response = { ...base, privateWallet: { ...base.privateWallet, privateAddress: otherRecipient } };
  await assert.rejects(client.execute('invoice-history'), /history could not be opened/);
  response = base; late = true; await assert.rejects(client.execute('invoice-history'), /account changed/);
});
