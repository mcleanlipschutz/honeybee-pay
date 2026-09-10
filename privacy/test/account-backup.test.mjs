import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { HDNodeWallet } from 'ethers';
import { encryptAccountBackup, decryptAccountBackup } from '../src/account-backup.mjs';

test('encrypted recovery authenticates the account, ciphertext and password', async () => {
  const mnemonic = HDNodeWallet.createRandom().mnemonic.phrase;
  const password = randomBytes(24).toString('hex');
  const owner = randomBytes(32).toString('hex');
  const backup = await encryptAccountBackup(mnemonic, password, owner);
  assert.equal(await decryptAccountBackup(backup, password, owner), mnemonic);
  for (const secret of [mnemonic, password, owner]) assert.equal(backup.includes(secret), false);
  await assert.rejects(decryptAccountBackup(backup, 'incorrect-password-long-enough', owner));
  await assert.rejects(decryptAccountBackup(backup, password, randomBytes(32).toString('hex')));
  for (const field of ['ciphertext', 'tag', 'salt', 'iv']) {
    const altered = JSON.parse(backup);
    altered[field] = (altered[field][0] === 'a' ? 'b' : 'a') + altered[field].slice(1);
    await assert.rejects(decryptAccountBackup(JSON.stringify(altered), password, owner));
  }
});

test('backup import bounds KDF cost, size, format and password length before decryption', async () => {
  const mnemonic = HDNodeWallet.createRandom().mnemonic.phrase;
  const password = randomBytes(24).toString('hex'), owner = randomBytes(32).toString('hex');
  await assert.rejects(encryptAccountBackup(mnemonic, 'short', owner));
  const backup = JSON.parse(await encryptAccountBackup(mnemonic, password, owner));
  for (const changed of [{ ...backup, version: 2 }, { ...backup, cipher: 'aes-128-ctr' },
    { ...backup, kdf: { ...backup.kdf, N: 2 ** 30 } }, { ...backup, salt: 'ab' },
    { ...backup, ciphertext: 'zz' }]) {
    await assert.rejects(decryptAccountBackup(JSON.stringify(changed), password, owner));
  }
  await assert.rejects(decryptAccountBackup('x'.repeat(8193), password, owner));
  await assert.rejects(decryptAccountBackup('null', password, owner));
});
