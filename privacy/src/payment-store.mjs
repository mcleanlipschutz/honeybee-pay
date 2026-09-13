import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { open, lstat, realpath, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';

const limit = 4 * 1024 * 1024;
const fail = () => new Error('Private payment records are unavailable; no payment was retried');
// The account worker lease MUST cover the whole read/modify/write operation.
// This journal is encrypted separately from recovery and merchant requests.
// Clearing or restoring old local storage cannot establish that a payment never occurred.
export function createPaymentStore({ directory, privateKey, ownerId, checkSession }) {
  if (!isAbsolute(directory) || resolve(directory) !== directory || !/^[a-f0-9]{64}$/.test(ownerId)
      || !/^0x[a-f0-9]{64}$/.test(privateKey)) throw fail();
  const file = join(directory, 'private-payments.v1.json');
  const aad = Buffer.from(`honeybee:private-payment-journal:v1:${ownerId}`);
  const keyFor = salt => Buffer.from(hkdfSync('sha256', Buffer.from(privateKey.slice(2), 'hex'), salt, aad, 32));
  const validate = value => {
    if (value?.version !== 1 || !Array.isArray(value.payments) || value.payments.length > 16
        || new Set(value.payments.map(p => p.quote?.quoteId)).size !== value.payments.length
        || value.payments.some(p => !/^0x[a-f0-9]{64}$/.test(p.quote?.quoteId)
          || !['quoted', 'unknown', 'pending', 'confirmed', 'reverted'].includes(p.status))) throw fail();
    return value;
  };
  const guard = async (retainOutcome = false) => {
    if (!retainOutcome) checkSession();
    const s = await lstat(directory);
    if (!s.isDirectory() || s.isSymbolicLink() || await realpath(directory) !== directory
        || (process.platform !== 'win32' && ((s.mode & 0o777) !== 0o700 || s.uid !== process.getuid()))) throw fail();
  };
  const read = async () => {
    await guard();
    let before;
    try { before = await lstat(file); } catch (e) { if (e.code === 'ENOENT') return { version: 1, payments: [] }; throw fail(); }
    if (!before.isFile() || before.isSymbolicLink()) throw fail();
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let key;
    try {
      const s = await handle.stat();
      if (!s.isFile() || s.ino !== before.ino || s.dev !== before.dev || s.nlink !== 1
          || s.size < 1 || s.size > limit || await realpath(file) !== file
          || (process.platform !== 'win32' && ((s.mode & 0o777) !== 0o600 || s.uid !== process.getuid()))) throw fail();
      const buffer = Buffer.alloc(limit + 1); let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
        if (!bytesRead) break; size += bytesRead;
      }
      if (size > limit) throw fail();
      const value = JSON.parse(buffer.subarray(0, size).toString('utf8'));
      if (value.version !== 1 || !/^[a-f0-9]{64}$/.test(value.salt) || !/^[a-f0-9]{24}$/.test(value.iv)
          || !/^[a-f0-9]{32}$/.test(value.tag) || !/^(?:[a-f0-9]{2})+$/.test(value.data)) throw fail();
      key = keyFor(Buffer.from(value.salt, 'hex'));
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'hex'));
      decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
      const plain = Buffer.concat([decipher.update(Buffer.from(value.data, 'hex')), decipher.final()]);
      try { checkSession(); return validate(JSON.parse(plain)); } finally { plain.fill(0); }
    } catch { throw fail(); }
    finally { key?.fill(0); await handle.close(); }
  };
  const write = async (value, { retainOutcome = false } = {}) => {
    validate(value); await guard(retainOutcome);
    const salt = randomBytes(32), iv = randomBytes(12), key = keyFor(salt);
    const plain = Buffer.from(JSON.stringify(value));
    const temporary = join(directory, `.private-payment-${randomBytes(16).toString('hex')}.tmp`);
    let handle;
    try {
      const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad);
      const data = Buffer.concat([cipher.update(plain), cipher.final()]);
      const text = JSON.stringify({ version: 1, salt: salt.toString('hex'), iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex') });
      if (Buffer.byteLength(text) > limit) throw fail();
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(text); await handle.sync(); await handle.close(); handle = null;
      if (!retainOutcome) checkSession();
      await rename(temporary, file);
      if (process.platform !== 'win32') {
        const dir = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
        try { await dir.sync(); } finally { await dir.close(); }
      }
    } finally {
      key.fill(0); plain.fill(0); if (handle) await handle.close();
      await rm(temporary, { force: true });
    }
  };
  return Object.freeze({ read, write });
}
