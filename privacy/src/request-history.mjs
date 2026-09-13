import { keccak256, toUtf8Bytes } from 'ethers';
import { validateHistoryBackup, requestHistoryFileLimit, historyBackupFormat } from '../../shared/request-history-backup.mjs';
export { requestHistoryFileLimit } from '../../shared/request-history-backup.mjs';
import { randomBytes, hkdfSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { open, lstat, realpath, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { invoiceValidation } from './account-invoice.mjs';
import { validatePrivateRequest } from '../../shared/private-request.mjs';
import { privateRequestHistory, validatePrivateRequestHistory, requestHistoryLimit } from '../../shared/private-request-history.mjs';

export const requestHistoryFilename = 'merchant-requests.v1.json';
const format = historyBackupFormat;
const failure = () => new Error('Saved payment requests could not be opened or saved. Existing history was not reset.');
const hex = (value, length) => {
  if (typeof value !== 'string' || value.length !== length * 2 || !/^[a-f0-9]+$/.test(value)) throw failure();
  return Buffer.from(value, 'hex');
};
function accountBinding(ownerId) {
  if (typeof ownerId !== 'string' || !/^[a-f0-9]{64}$/.test(ownerId)) throw failure();
  return Buffer.from(`${format}:v1:${ownerId}`, 'utf8');
}
function deriveKey(privateKey, salt, binding) {
  if (typeof privateKey !== 'string' || !/^0x[a-f0-9]{64}$/.test(privateKey)) throw failure();
  const material = Buffer.from(privateKey.slice(2), 'hex');
  try { return Buffer.from(hkdfSync('sha256', material, salt, binding, 32)); }
  finally { material.fill(0); }
}
function encrypt(history, privateKey, ownerId) {
  const binding = accountBinding(ownerId), salt = randomBytes(32), iv = randomBytes(12);
  const key = deriveKey(privateKey, salt, binding), plaintext = Buffer.from(JSON.stringify(history));
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    cipher.setAAD(binding);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const text = JSON.stringify({ format, version: 1, cipher: 'aes-256-gcm', kdf: 'hkdf-sha256',
      salt: salt.toString('hex'), iv: iv.toString('hex'), ciphertext: ciphertext.toString('hex'), tag: cipher.getAuthTag().toString('hex') });
    if (Buffer.byteLength(text) > requestHistoryFileLimit) throw failure();
    return text;
  } finally { key.fill(0); plaintext.fill(0); }
}
function decrypt(text, privateKey, ownerId, dependencies) {
  let key, plaintext;
  try {
    const value = JSON.parse(validateHistoryBackup(text)), binding = accountBinding(ownerId);
    key = deriveKey(privateKey, hex(value.salt, 32), binding);
    const decipher = createDecipheriv('aes-256-gcm', key, hex(value.iv, 12), { authTagLength: 16 });
    decipher.setAAD(binding); decipher.setAuthTag(hex(value.tag, 16));
    plaintext = Buffer.concat([decipher.update(hex(value.ciphertext, value.ciphertext.length / 2)), decipher.final()]);
    return validatePrivateRequestHistory(JSON.parse(plaintext.toString('utf8')), dependencies);
  } catch { throw failure(); }
  finally { key?.fill(0); plaintext?.fill(0); }
}

// The caller MUST hold the existing per-account worker lock for the entire
// read/append operation. No externally supplied directory, owner or key reaches it.
export function createRequestHistoryStore({ directory, privateKey, ownerId, recipient, checkSession, now = () => Math.floor(Date.now() / 1000) }) {
  if (!isAbsolute(directory) || resolve(directory) !== directory || typeof checkSession !== 'function') throw failure();
  accountBinding(ownerId);
  const filename = join(directory, requestHistoryFilename);
  const dependencies = () => ({ ...invoiceValidation(now()), recipient });
  const guard = async () => {
    checkSession();
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory
        || (process.platform !== 'win32' && ((info.mode & 0o777) !== 0o700 || info.uid !== process.getuid()))) throw failure();
    checkSession();
  };
  const read = async () => {
    await guard();
    let handle, before;
    try { before = await lstat(filename); }
    catch (error) {
      if (error.code !== 'ENOENT') throw failure();
      // Existing pre-history wallets have no file. Deletion/rollback by the
      // local filesystem owner is not detectable; this is not a payment ledger.
      checkSession(); return privateRequestHistory([], dependencies());
    }
    if (!before.isFile() || before.isSymbolicLink()) throw failure();
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.dev !== before.dev || info.ino !== before.ino || await realpath(filename) !== filename
          || info.nlink !== 1 || info.size < 1 || info.size > requestHistoryFileLimit
          || (process.platform !== 'win32' && ((info.mode & 0o777) !== 0o600 || info.uid !== process.getuid()))) throw failure();
      // Bound allocation even if a local file grows after the metadata check.
      const buffer = Buffer.alloc(requestHistoryFileLimit + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
        if (!bytesRead) break;
        size += bytesRead;
      }
      if (!size || size > requestHistoryFileLimit) throw failure();
      const text = buffer.subarray(0, size).toString('utf8');
      checkSession();
      return decrypt(text, privateKey, ownerId, dependencies());
    } finally { await handle.close(); }
  };
  const write = async history => {
    const encrypted = encrypt(history, privateKey, ownerId);
    const temporary = join(directory, `.merchant-requests-${randomBytes(16).toString('hex')}.tmp`);
    let handle, created = false;
    try {
      await guard();
      handle = await open(temporary, 'wx', 0o600); created = true;
      await handle.writeFile(encrypted, 'utf8'); await handle.sync();
      await handle.close(); handle = null;
      checkSession();
      await rename(temporary, filename);
      // POSIX directory sync makes the replacement durable; browser/device and
      // Windows power-loss behavior still require platform-specific validation.
      if (process.platform !== 'win32') {
        const dir = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
        try { await dir.sync(); } finally { await dir.close(); }
      }
      checkSession();
      return history;
    } finally {
      try { if (handle) await handle.close(); }
      finally { if (created) await rm(temporary, { force: true }); }
    }
  };
  const append = async request => {
    const value = validatePrivateRequest(request, invoiceValidation(now()));
    const previous = await read();
    if (value.recipient !== recipient) throw failure();
    const duplicate = previous.requests.find(item => item.id === value.id);
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(value)) throw failure();
      return previous;
    }
    if (previous.requests.length >= requestHistoryLimit) throw new Error('Local request history has reached its 128-request test limit. No existing request was deleted.');
    const history = privateRequestHistory([...previous.requests, value], dependencies());
    return write(history);
  };
  const exportBackup = async () => {
    const requestHistory = await read();
    const encryptedRequestHistory = encrypt(requestHistory, privateKey, ownerId);
    checkSession();
    return { requestHistory, encryptedRequestHistory };
  };
  const restoreBackup = async text => {
    checkSession();
    const normalized = validateHistoryBackup(text);
    const imported = decrypt(normalized, privateKey, ownerId, dependencies());
    const previous = await read(); // Corrupt local state cannot be reset by import.
    const merged = new Map(previous.requests.map(request => [request.id, request]));
    let added = 0;
    for (const request of imported.requests) {
      const existing = merged.get(request.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(request)) throw failure();
      if (!existing) { merged.set(request.id, request); added++; }
    }
    if (merged.size > requestHistoryLimit) throw new Error('Restoring this backup would exceed the 128-request test limit. No requests were changed.');
    const requestHistory = privateRequestHistory([...merged.values()], dependencies());
    if (added) await write(requestHistory);
    checkSession();
    return { requestHistory, historyRestoration: { backupDigest: keccak256(toUtf8Bytes(normalized)),
      added, alreadySaved: imported.requests.length - added, total: requestHistory.requests.length } };
  };
  return Object.freeze({ read, append, exportBackup, restoreBackup });
}
