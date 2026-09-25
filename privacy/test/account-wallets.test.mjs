import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readdir, readFile, stat, cp, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createAccountWalletService } from '../src/account-wallets.mjs';
import { createAccountAuthenticator } from '../src/account-auth.mjs';
import { accountFixture } from './account-fixture.mjs';

// The total includes many fresh SDK processes. Individual application worker
// deadlines and password KDF settings are intentionally unchanged.
test('independent account wallets recover in new processes and reject cross-account access and overwrite', { timeout: process.platform === 'win32' ? 360000 : 90000 }, async t => {
  const started = performance.now();
  const checkpoint = stage => t.diagnostic('wallet fixture: ' + stage + ' at ' + Math.round(performance.now() - started) + ' ms');
  checkpoint('starting');
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'honeybee-accounts-')));
  const recoveryDirectory = await realpath(await mkdtemp(join(tmpdir(), 'honeybee-recovery-')));
  t.after(() => Promise.all([directory, recoveryDirectory].map(path => rm(path, { recursive: true, force: true }))));
  const fixture = await accountFixture();
  const buyerToken = await fixture.token(), merchantToken = await fixture.token('merchant');
  const buyerPassword = randomBytes(24).toString('hex'), merchantPassword = randomBytes(24).toString('hex');
  const service = await createAccountWalletService({ directory, ...fixture });
  await assert.rejects(service.execute({ action: 'create', accessToken: 'forged', password: buyerPassword }));
  assert.deepEqual(await readdir(directory), []);
  const empty = await service.execute({ action: 'status', accessToken: buyerToken });
  assert.equal(empty.privateWallet.status, 'not-created');
  checkpoint('empty wallet status checked');
  const attempts = await Promise.allSettled([0, 1].map(() => service.execute({ action: 'create', accessToken: buyerToken, password: buyerPassword })));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(r => r.status === 'rejected').length, 1);
  const buyer = attempts.find(r => r.status === 'fulfilled').value;
  const merchant = await service.execute({ action: 'create', accessToken: merchantToken, password: merchantPassword });
  assert.notEqual(buyer.privateWallet.id, merchant.privateWallet.id);
  assert.notEqual(buyer.privateWallet.privateAddress, merchant.privateWallet.privateAddress);
  checkpoint('separate buyer and merchant wallets created');
  const saved = await service.execute({ action: 'backup', accessToken: buyerToken, password: buyerPassword });
  const backup = saved.encryptedBackup;
  await assert.rejects(service.execute({ action: 'unlock', accessToken: merchantToken, password: buyerPassword }));
  await assert.rejects(service.execute({ action: 'unlock', accessToken: buyerToken, password: buyerPassword, ownerId: 'merchant' }));
  await assert.rejects(service.execute({ action: 'status', accessToken: buyerToken, verified: true }));
  await assert.rejects(service.execute({ action: 'create', accessToken: buyerToken, password: buyerPassword }));
  await assert.rejects(service.execute({ action: 'restore', accessToken: buyerToken, password: buyerPassword, backup }));
  const again = await service.execute({ action: 'backup', accessToken: buyerToken, password: buyerPassword });
  assert.equal(again.encryptedBackup, backup);
  checkpoint('backup and overwrite protections checked');
  // New service and child process, with a new login session, restores the same
  // account. A different authenticated account with the correct password fails.
  const recoveredService = await createAccountWalletService({ directory: recoveryDirectory, ...fixture });
  await assert.rejects(recoveredService.execute({ action: 'restore', accessToken: merchantToken, password: buyerPassword, backup }));
  assert.deepEqual(await readdir(recoveryDirectory), []);
  const recovered = await recoveredService.execute({ action: 'restore', accessToken: await fixture.token('buyer', { sid: 'recovered-session' }), password: buyerPassword, backup });
  assert.deepEqual(recovered.privateWallet, buyer.privateWallet);
  const restarted = await createAccountWalletService({ directory: recoveryDirectory, ...fixture });
  const unlocked = await restarted.execute({ action: 'unlock', accessToken: buyerToken, password: buyerPassword });
  assert.deepEqual(unlocked.privateWallet, buyer.privateWallet);
  checkpoint('fresh-process recovery and unlock completed');
  for (const result of [buyer, merchant, saved, recovered, unlocked]) {
    assert.equal(result.identityVerification.status, 'deferred-for-testnet');
    assert.equal(result.identityVerification.verified, false);
    assert.equal(result.identityVerification.requiredForTestnet, false);
    assert.equal(result.blockers.includes('identity-verification-not-configured'), false);
    assert.equal(result.paymentReady, false);
    assert.equal(result.networkLoaded, false);
    for (const secret of [buyerPassword, merchantPassword, buyerToken, merchantToken]) assert.equal(JSON.stringify(result).includes(secret), false);
  }
  // Copying another account's files cannot bypass the cryptographic backup binding.
  const authenticate = await createAccountAuthenticator(fixture);
  const buyerId = (await authenticate(buyerToken)).ownerId, merchantId = (await authenticate(merchantToken)).ownerId;
  await cp(join(recoveryDirectory, buyerId), join(recoveryDirectory, merchantId), { recursive: true });
  await assert.rejects(restarted.execute({ action: 'unlock', accessToken: merchantToken, password: buyerPassword }));
  const backupPath = join(directory, buyerId, 'account.backup.json');
  assert.equal(await readFile(backupPath, 'utf8'), backup);
  if (process.platform !== 'win32') assert.equal((await stat(backupPath)).mode & 0o777, 0o600);
  checkpoint('cross-account backup binding checked');
});

test('account storage rejects unsafe directories and symlinked backup files', {
  timeout: 30000, skip: process.platform === 'win32' ? 'POSIX permission and symlink fixture; Windows ACL validation remains separate' : false,
}, async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'honeybee-account-path-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = await accountFixture(), accessToken = await fixture.token();
  await assert.rejects(createAccountWalletService({ directory: 'relative', ...fixture }));
  const service = await createAccountWalletService({ directory, ...fixture });
  await chmod(directory, 0o755);
  await assert.rejects(service.execute({ action: 'status', accessToken }));
  await chmod(directory, 0o700);
  const password = randomBytes(24).toString('hex');
  await service.execute({ action: 'create', accessToken, password });
  const authenticate = await createAccountAuthenticator(fixture);
  const owner = (await authenticate(accessToken)).ownerId;
  const backupPath = join(directory, owner, 'account.backup.json');
  const copied = join(directory, 'copied-backup.json');
  await cp(backupPath, copied);
  await rm(backupPath);
  await symlink(copied, backupPath);
  await assert.rejects(service.execute({ action: 'backup', accessToken, password }));
});
