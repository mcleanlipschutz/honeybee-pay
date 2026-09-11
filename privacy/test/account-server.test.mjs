import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { startAccountServer } from '../src/account-server.mjs';
import { accountFixture } from './account-fixture.mjs';
import { paymentRequestFile, readPaymentRequest } from '../../checkout/src/private-request.mjs';
import { historyRestoreBodyLimit, historyBackupFormat } from '../../shared/request-history-backup.mjs';
import { createAccountWalletClient } from '../../checkout/src/account-client.mjs';

async function setup(t, fixture, existingDirectory) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'honeybee-http-')));
  const directory = existingDirectory ?? join(root, 'accounts'), distDirectory = join(root, 'dist');
  if (!existingDirectory) await mkdir(directory, { mode: 0o700 });
  await mkdir(distDirectory);
  await writeFile(join(distDirectory, 'index.html'), '<!doctype html><title>Local test fixture</title>');
  const server = await startAccountServer({ directory, distDirectory, ...fixture, port: 0 });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  return { ...server, directory };
}
function client(server, accessToken) {
  return createAccountWalletClient({ origin: server.origin, getAccessToken: async () => accessToken,
    // Browsers supply Origin themselves; Node's fetch needs it explicitly.
    fetchImpl: (url, options) => fetch(url, { ...options, headers: { ...options.headers, Origin: server.origin } }) });
}

test('browser client and local API create, export, verify and restore actual account wallets', { timeout: 120000 }, async t => {
  const fixture = await accountFixture(), server = await setup(t, fixture);
  const buyer = client(server, await fixture.token()), merchant = client(server, await fixture.token('merchant'));
  const password = randomBytes(24).toString('hex');
  const initial = await buyer.execute('status');
  assert.equal(initial.privateWallet.status, 'not-created');
  const created = await buyer.execute('create', { password });
  assert.equal(typeof created.encryptedBackup, 'string');
  assert.equal(created.encryptedBackup.includes(password), false);
  assert.equal(created.identityVerification.requiredForTestnet, false);
  assert.equal(created.blockers.includes('identity-verification-not-configured'), false);
  const verified = await buyer.execute('verify-backup', { password, backup: created.encryptedBackup });
  assert.equal(verified.recovery, 'backup-verified');
  assert.deepEqual(verified.privateWallet, created.privateWallet);
  assert.equal(verified.paymentReady, false);
  await assert.rejects(merchant.execute('restore', { password, backup: created.encryptedBackup }));
  const merchantPassword = randomBytes(24).toString('hex');
  const other = await merchant.execute('create', { password: merchantPassword });
  assert.notEqual(other.privateWallet.privateAddress, created.privateWallet.privateAddress);
  await assert.rejects(buyer.execute('verify-backup', { password, backup: other.encryptedBackup }));
  await assert.rejects(buyer.execute('create', { password }));
  const secondServer = await setup(t, fixture);
  const recovered = await client(secondServer, await fixture.token('buyer', { sid: 'new-session' })).execute('restore', { password, backup: created.encryptedBackup });
  assert.deepEqual(recovered.privateWallet, created.privateWallet);
  assert.equal(recovered.recovery, 'restored');
  // Actual SDK recovery through HTTP and browser validation, with no RPC configured.
  const fields = { password, amount: '1.00', lifetimeSeconds: 3600 };
  const invoice = await buyer.execute('invoice-create', fields);
  assert.equal(invoice.paymentRequest.recipient, created.privateWallet.privateAddress);
  assert.equal(invoice.networkLoaded, false); assert.equal(invoice.paymentReady, false);
  assert.equal(invoice.requestHistory.requests[0].digest, invoice.paymentRequest.digest);
  const opened = await buyer.execute('invoice-history', { password });
  assert.deepEqual(opened.requestHistory, invoice.requestHistory);
  const restartedServer = await setup(t, fixture, server.directory);
  const reopened = await client(restartedServer, await fixture.token('buyer', { sid: 'new-session' })).execute('invoice-history', { password });
  assert.deepEqual(reopened.requestHistory, invoice.requestHistory);
  await assert.rejects(buyer.execute('invoice-history', { password: randomBytes(24).toString('hex') }));
  await assert.rejects(buyer.execute('invoice-history', { password, ownerId: 'merchant' }));
  assert.equal((await buyer.execute('status')).requestHistory, undefined);
  assert.deepEqual(readPaymentRequest(paymentRequestFile(invoice.paymentRequest)), invoice.paymentRequest);
  const otherInvoice = await merchant.execute('invoice-create', { ...fields, password: merchantPassword });
  assert.notEqual(otherInvoice.paymentRequest.recipient, invoice.paymentRequest.recipient);
  assert.equal(otherInvoice.requestHistory.requests.some(item => item.id === invoice.paymentRequest.id), false);
  const restarted = await client(secondServer, await fixture.token()).execute('invoice-create', fields);
  assert.equal(restarted.paymentRequest.recipient, invoice.paymentRequest.recipient);
  assert.notEqual(restarted.paymentRequest.id, invoice.paymentRequest.id);
  const exportedHistory = await buyer.execute('invoice-history-export', { password });
  const destination = client(secondServer, await fixture.token());
  const restoreFields = { password, historyBackup: exportedHistory.encryptedRequestHistory };
  const restoredHistory = await destination.execute('invoice-history-restore', restoreFields);
  assert.equal(restoredHistory.historyRestoration.added, 1);
  assert.equal(restoredHistory.historyRestoration.total, 2);
  assert.equal(restoredHistory.requestHistory.requests.some(item => item.id === restarted.paymentRequest.id), true);
  assert.equal((await destination.execute('invoice-history-restore', restoreFields)).historyRestoration.added, 0);
  assert.deepEqual((await destination.execute('invoice-history', { password })).requestHistory, restoredHistory.requestHistory);
  await assert.rejects(merchant.execute('invoice-history-restore', { ...restoreFields, password: merchantPassword }));
  await assert.rejects(buyer.execute('invoice-history-export', { password: randomBytes(24).toString('hex') }));
  const backup = await buyer.execute('backup', { password });
  assert.equal(backup.encryptedBackup, created.encryptedBackup);
  await assert.rejects(buyer.execute('invoice-create', { ...fields, password: randomBytes(24).toString('hex') }));
  for (const selector of ['recipient', 'token', 'network', 'ownerId', 'directory', 'id', 'createdAt', 'expiresAt']) {
    await assert.rejects(buyer.execute('invoice-create', { ...fields, [selector]: 'injected' }));
  }
  await assert.rejects(client(server, 'forged').execute('invoice-create', fields));
});

test('local HTTP boundary rejects other origins, forged tokens, selectors and secret-file paths', { timeout: 15000 }, async t => {
  const fixture = await accountFixture(), server = await setup(t, fixture);
  const token = await fixture.token();
  const base = { Origin: server.origin, 'Content-Type': 'application/json', 'X-Honeybee-Request': 'wallet-v1', Authorization: `Bearer ${token}` };
  const post = (headers = {}, data = { action: 'status' }) => fetch(server.origin + '/api/account-wallet', { method: 'POST', headers: { ...base, ...headers }, body: JSON.stringify(data) });
  assert.equal((await post({ Origin: 'https://evil.test' })).status, 403);
  const wrongHost = await new Promise((resolveStatus, reject) => {
    // Node fetch normalizes Host, so use HTTP directly to exercise DNS rebinding.
    const req = httpRequest(server.origin + '/api/account-wallet', { method: 'POST', headers: { ...base, Host: 'evil.test' } }, response => {
      response.resume(); response.on('end', () => resolveStatus(response.statusCode));
    });
    req.on('error', reject); req.end(JSON.stringify({ action: 'status' }));
  });
  assert.equal(wrongHost, 403);
  assert.equal((await post({ 'X-Honeybee-Request': '' })).status, 403);
  assert.equal((await post({ Authorization: 'Bearer forged' })).status, 401);
  assert.equal((await post({ 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post({}, { action: 'status', ownerId: '../merchant' })).status, 400);
  assert.equal((await post({}, { action: 'status', verified: true })).status, 400);
  assert.equal((await post({}, { action: 'status', accessToken: token })).status, 400);
  assert.equal((await post({}, { action: 'restore', backup: 'x'.repeat(17000) })).status, 413);
  assert.equal((await fetch(server.origin + '/api/account-wallet')).status, 405);
  for (const path of ['/.env.local', '/src/account-auth.mjs', '/account.backup.json', '/assets/%2e%2e%2faccount.backup.json', '/api/account-wallet?accessToken=forged']) {
    assert.equal((await fetch(server.origin + path)).status, 404);
  }
  const runtime = await fetch(server.origin + '/api/runtime');
  assert.equal(runtime.headers.get('cache-control'), 'no-store');
  assert.equal(runtime.headers.has('access-control-allow-origin'), false);
  const capabilities = await runtime.json();
  assert.equal(capabilities.identityVerification, 'deferred-for-testnet');
  assert.equal(capabilities.privateRequestsEnabled, true);
  assert.equal(capabilities.shieldSubmissionEnabled, false);
  const page = await fetch(server.origin + '/'); assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.deepEqual(await readdir(server.directory), []);
});

test('local API limits repeated authenticated wallet requests', { timeout: 15000 }, async t => {
  const fixture = await accountFixture(), server = await setup(t, fixture);
  const token = await fixture.token();
  const statuses = [];
  for (let index = 0; index < 31; index++) {
    const response = await fetch(server.origin + '/api/account-wallet', { method: 'POST', headers: {
      Origin: server.origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Honeybee-Request': 'wallet-v1',
    }, body: '{}' });
    statuses.push(response.status); await response.arrayBuffer();
  }
  assert.equal(statuses[0], 400); assert.equal(statuses.at(-1), 429);
  assert.deepEqual(await readdir(server.directory), []);
});


test('history restore has its own bounded authenticated upload route while wallet requests retain 16 KB limit', { timeout: 15000 }, async t => {
  const fixture = await accountFixture(), server = await setup(t, fixture);
  const token = await fixture.token();
  const headers = { Origin: server.origin, 'Content-Type': 'application/json', 'X-Honeybee-Request': 'wallet-v1', Authorization: `Bearer ${token}` };
  const historyBackup = JSON.stringify({ format: historyBackupFormat, version: 1, cipher: 'aes-256-gcm', kdf: 'hkdf-sha256',
    salt: '11'.repeat(32), iv: '22'.repeat(12), tag: '33'.repeat(16), ciphertext: '44'.repeat(10000) });
  const data = { action: 'invoice-history-restore', password: 'fixture-password-long-enough', historyBackup };
  const post = (path, body = data, extra = {}) => fetch(server.origin + path, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  assert.equal((await post('/api/account-wallet')).status, 413);
  assert.equal((await post('/api/account-history/restore')).status, 400); // Body accepted; missing account/unauthentic ciphertext rejected.
  assert.equal((await post('/api/account-history/restore', data, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post('/api/account-history/restore', data, { Authorization: 'Bearer forged' })).status, 401);
  assert.equal((await post('/api/account-history/restore', { action: 'status' })).status, 400);
  assert.equal((await post('/api/account-wallet', { ...data, historyBackup: '{}' })).status, 400);
  assert.equal((await post('/api/account-history/restore', { ...data, ownerId: '../other-account' })).status, 400);
  assert.equal((await post('/api/account-history/restore', { ...data, historyBackup: 'x'.repeat(historyRestoreBodyLimit) })).status, 413);
  const streamed = await new Promise((resolveStatus, reject) => {
    const request = httpRequest(server.origin + '/api/account-history/restore', { method: 'POST', headers: { ...headers, 'Transfer-Encoding': 'chunked' } }, response => {
      response.resume(); response.on('end', () => resolveStatus(response.statusCode));
    });
    request.on('error', reject); request.end(' '.repeat(historyRestoreBodyLimit + 1));
  });
  assert.equal(streamed, 413);
  assert.deepEqual(await readdir(server.directory), []);
});
