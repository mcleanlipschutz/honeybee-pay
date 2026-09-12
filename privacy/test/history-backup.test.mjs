import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, realpath, chmod, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RailgunEngine } from '@railgun-community/engine';
import { createAccountInvoice, invoiceValidation } from '../src/account-invoice.mjs';
import { createRequestHistoryStore, requestHistoryFilename } from '../src/request-history.mjs';
import { validateHistoryBackup, createHistoryBackupReader, requestHistoryFileLimit } from '../../shared/request-history-backup.mjs';
import { privateRequestBody } from '../../shared/private-request.mjs';
import { paymentRequestFile } from '../../checkout/src/private-request.mjs';
import { createAccountWalletClient } from '../../checkout/src/account-client.mjs';

const clock = 1800000000;
const recipient = RailgunEngine.encodeAddress({ masterPublicKey: 123n, viewingPublicKey: new Uint8Array(32).fill(2) });
const invoice = (options = {}) => createAccountInvoice({ wallet: { id: 'fixture', railgunAddress: recipient },
  amount: '1', lifetimeSeconds: 900, now: clock, checkSession() {}, ...options }).paymentRequest;
async function fixture(t, account = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'honeybee-history-backup-')));
  await chmod(directory, 0o700); t.after(() => rm(directory, { recursive: true, force: true }));
  const { directory: ignored, ...keys } = account;
  const context = { privateKey: '0x' + randomBytes(32).toString('hex'), ownerId: randomBytes(32).toString('hex'),
    recipient, now: () => clock, checkSession() {}, ...keys, directory };
  return { context, filename: join(directory, requestHistoryFilename), store: createRequestHistoryStore(context) };
}

test('encrypted exports recover exact history in another directory without changing the source file', async t => {
  const source = await fixture(t), first = invoice(), second = invoice({ amount: '2' });
  await source.store.append(first); await source.store.append(second);
  const saved = await readFile(source.filename, 'utf8');
  const exported = await source.store.exportBackup();
  assert.equal(await readFile(source.filename, 'utf8'), saved);
  assert.equal(validateHistoryBackup(exported.encryptedRequestHistory + '\n'), exported.encryptedRequestHistory);
  for (const secret of [recipient, first.id, source.context.ownerId, source.context.privateKey.slice(2), 'amountUnits']) {
    assert.equal(exported.encryptedRequestHistory.includes(secret), false);
  }
  const destination = await fixture(t, source.context);
  const restored = await destination.store.restoreBackup(exported.encryptedRequestHistory);
  assert.deepEqual(restored.requestHistory, exported.requestHistory);
  assert.equal(restored.historyRestoration.added, 2);
  assert.deepEqual((await createRequestHistoryStore(destination.context).read()).requests, exported.requestHistory.requests);
});

test('restoring older snapshots preserves newer requests and repeating restore does not rewrite history', async t => {
  const source = await fixture(t), first = invoice(); await source.store.append(first);
  const exported = await source.store.exportBackup();
  const destination = await fixture(t, source.context), newer = invoice({ amount: '3' });
  await destination.store.append(newer);
  const restored = await destination.store.restoreBackup(exported.encryptedRequestHistory);
  assert.equal(restored.requestHistory.requests.length, 2);
  assert.equal(restored.requestHistory.requests.some(request => request.id === newer.id), true);
  const saved = await readFile(destination.filename, 'utf8');
  const repeated = await destination.store.restoreBackup(exported.encryptedRequestHistory);
  assert.equal(repeated.historyRestoration.added, 0); assert.equal(repeated.historyRestoration.alreadySaved, 1);
  assert.equal(await readFile(destination.filename, 'utf8'), saved);
});

test('wrong accounts, roots and tampered ciphertext cannot alter destination records', async t => {
  const source = await fixture(t); await source.store.append(invoice());
  const { encryptedRequestHistory: backup } = await source.store.exportBackup();
  const destinations = [await fixture(t), await fixture(t, { ...source.context, privateKey: '0x' + randomBytes(32).toString('hex') }),
    await fixture(t, { ...source.context, ownerId: randomBytes(32).toString('hex') })];
  for (const destination of destinations) {
    await destination.store.append(invoice()); const saved = await readFile(destination.filename, 'utf8');
    await assert.rejects(destination.store.restoreBackup(backup));
    assert.equal(await readFile(destination.filename, 'utf8'), saved);
  }
  const destination = await fixture(t, source.context); await destination.store.append(invoice());
  const saved = await readFile(destination.filename, 'utf8'), envelope = JSON.parse(backup);
  for (const field of ['tag', 'iv', 'salt', 'ciphertext']) {
    const value = envelope[field], mutated = (value[0] === 'a' ? 'b' : 'a') + value.slice(1);
    await assert.rejects(destination.store.restoreBackup(JSON.stringify({ ...envelope, [field]: mutated })));
    assert.equal(await readFile(destination.filename, 'utf8'), saved);
  }
  await writeFile(destination.filename, '{broken');
  await assert.rejects(destination.store.restoreBackup(backup));
  assert.equal(await readFile(destination.filename, 'utf8'), '{broken');
});

test('conflicting IDs and oversized merged histories reject the entire restore', async t => {
  const source = await fixture(t), destination = await fixture(t, source.context), first = invoice();
  await destination.store.append(first);
  await source.store.append(invoice()); // A safe addition preceding the conflict must not leak through.
  const changed = { ...first, amountUnits: '2000000' };
  changed.digest = invoiceValidation(clock).hash(JSON.stringify(privateRequestBody(changed)));
  await source.store.append(changed);
  const saved = await readFile(destination.filename, 'utf8');
  await assert.rejects(destination.store.restoreBackup((await source.store.exportBackup()).encryptedRequestHistory));
  assert.equal(await readFile(destination.filename, 'utf8'), saved);
  const full = await fixture(t, source.context);
  for (let index = 0; index < 128; index++) await full.store.append(invoice());
  const fullBackup = (await full.store.exportBackup()).encryptedRequestHistory;
  assert.ok(fullBackup.length > 16384);
  await assert.rejects(destination.store.restoreBackup(fullBackup), /128-request test limit/);
  assert.equal(await readFile(destination.filename, 'utf8'), saved);
});

test('restored expired requests stay historical and empty exports do not erase current records', async t => {
  const source = await fixture(t), empty = await source.store.exportBackup();
  assert.deepEqual(await readdir(source.context.directory), []);
  const request = invoice(); await source.store.append(request);
  const destination = await fixture(t, { ...source.context, now: () => request.expiresAt });
  const restored = await destination.store.restoreBackup((await source.store.exportBackup()).encryptedRequestHistory);
  assert.equal(restored.requestHistory.paymentStatus, 'not-checked');
  assert.throws(() => paymentRequestFile(restored.requestHistory.requests[0], request.expiresAt));
  const saved = await readFile(destination.filename, 'utf8');
  await destination.store.restoreBackup(empty.encryptedRequestHistory);
  assert.equal(await readFile(destination.filename, 'utf8'), saved);
});

test('an interrupted merge preserves the previous file and removes its temporary replacement', async t => {
  const source = await fixture(t); await source.store.append(invoice());
  const destination = await fixture(t, source.context); await destination.store.append(invoice());
  const saved = await readFile(destination.filename, 'utf8');
  const interrupted = createRequestHistoryStore({ ...destination.context, checkSession() {
    if (readdirSync(destination.context.directory).some(name => name.endsWith('.tmp'))) throw new Error('session ended');
  } });
  await assert.rejects(interrupted.restoreBackup((await source.store.exportBackup()).encryptedRequestHistory), /session ended/);
  assert.equal(await readFile(destination.filename, 'utf8'), saved);
  assert.deepEqual(await readdir(destination.context.directory), [requestHistoryFilename]);
});

test('backup reader bounds native files and discards late reads after account or selection changes', async t => {
  const source = await fixture(t), { encryptedRequestHistory: backup } = await source.store.exportBackup();
  for (const text of ['{', 'x'.repeat(requestHistoryFileLimit + 1), backup.replace('{', '{"version":1,'),
    backup.replace('"version":1', '"version":1.0'), JSON.stringify(JSON.parse(backup), null, 2), paymentRequestFile(invoice(), clock)]) {
    assert.throws(() => validateHistoryBackup(text));
  }
  let current = true, finish;
  const reader = createHistoryBackupReader({ isCurrent: () => current });
  const slow = () => ({ size: backup.length, text: () => new Promise(resolve => { finish = resolve; }) });
  let pending = reader.read(slow()); current = false; finish(backup); await assert.rejects(pending, /account or backup selection changed/);
  current = true; pending = reader.read(slow()); reader.clear(); finish(backup); await assert.rejects(pending, /selection changed/);
  pending = reader.read(slow());
  assert.equal(await reader.read({ size: backup.length, text: async () => backup }), backup);
  finish(backup); await assert.rejects(pending, /selection changed/);
  await assert.rejects(reader.read({ size: requestHistoryFileLimit + 1, text() { throw new Error('must not read'); } }), /256 KB/);
});

test('client binds restore response to uploaded backup, checks counts, isolates routes and never retries', async t => {
  const source = await fixture(t, { now: () => Math.floor(Date.now() / 1000) });
  await source.store.append(invoice({ now: Math.floor(Date.now() / 1000) }));
  const exported = await source.store.exportBackup(), destination = await fixture(t, source.context);
  const restored = await destination.store.restoreBackup(exported.encryptedRequestHistory);
  const base = { account: { authenticated: true }, network: 'Ethereum_Sepolia', paymentReady: false,
    identityVerification: { status: 'deferred-for-testnet', verified: false }, networkLoaded: false, spendableBalanceVerified: false,
    privateWallet: { status: 'locked', id: 'fixture', privateAddress: recipient } };
  let response = { ...base, ...restored }, calls = 0, expectedRoute = '/api/account-history/restore', current = true, late = false;
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture', isCurrent: () => current,
    fetchImpl: async (url, options) => { calls++; assert.equal(new URL(url).pathname, expectedRoute);
      assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
      if (late) current = false;
      return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } }); } });
  const fields = { historyBackup: exported.encryptedRequestHistory + '\n', password: 'test-only-password' };
  assert.equal((await client.execute('invoice-history-restore', fields)).historyRestoration.added, 1);
  for (const change of [{ backupDigest: '0x' + '00'.repeat(32) }, { added: -1 }, { total: 2 }, { added: 2 }, { status: 'paid' }]) {
    response = { ...base, ...restored, historyRestoration: { ...restored.historyRestoration, ...change } }; const before = calls;
    await assert.rejects(client.execute('invoice-history-restore', fields), /restore was not confirmed/); assert.equal(calls, before + 1);
  }
  const before = calls; await assert.rejects(client.execute('invoice-history-restore', { ...fields, historyBackup: '{}' })); assert.equal(calls, before);
  expectedRoute = '/api/account-wallet'; response = { ...base, ...exported };
  assert.equal((await client.execute('invoice-history-export')).encryptedRequestHistory, exported.encryptedRequestHistory);
  response = { ...response, encryptedRequestHistory: paymentRequestFile(invoice(), clock) };
  await assert.rejects(client.execute('invoice-history-export'), /could not be prepared/);
  response = { ...base, ...exported }; late = true;
  await assert.rejects(client.execute('invoice-history-export'), /account changed/);
});
