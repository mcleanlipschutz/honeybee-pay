import { randomBytes, scrypt, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { Mnemonic } from 'ethers';

const derive = promisify(scrypt);
export const accountBackupLimit = 8192;
const format = 'honeybee-account-wallet';
const kdf = Object.freeze({ name: 'scrypt', N: 131072, r: 8, p: 1, length: 32 });

export function checkRecoveryPassword(password) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 256) {
    throw new Error('Recovery password must contain 16 to 256 characters');
  }
}
function binding(ownerId) {
  if (typeof ownerId !== 'string' || !/^[a-f0-9]{64}$/.test(ownerId)) throw new Error('Invalid account binding');
  return Buffer.from(`${format}:v1:${ownerId}`);
}
async function keyFor(password, salt) {
  checkRecoveryPassword(password);
  return derive(password, salt, kdf.length, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 });
}
function decode(value, length) {
  if (typeof value !== 'string' || !/^[a-f0-9]+$/.test(value)
      || value.length !== length * 2) throw new Error('Invalid backup encoding');
  return Buffer.from(value, 'hex');
}

export async function encryptAccountBackup(mnemonic, password, ownerId) {
  const aad = binding(ownerId);
  if (!Mnemonic.isValidMnemonic(mnemonic)) throw new Error('Invalid wallet mnemonic');
  const salt = randomBytes(32), iv = randomBytes(12);
  const key = await keyFor(password, salt);
  const plaintext = Buffer.from(JSON.stringify({ version: 1, mnemonic, index: 0 }));
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return JSON.stringify({ format, version: 1, kdf, cipher: 'aes-256-gcm',
      salt: salt.toString('hex'), iv: iv.toString('hex'),
      ciphertext: ciphertext.toString('hex'), tag: cipher.getAuthTag().toString('hex') });
  } finally { key.fill(0); plaintext.fill(0); }
}

export async function decryptAccountBackup(encrypted, password, ownerId) {
  let key, plaintext;
  try {
    const aad = binding(ownerId);
    checkRecoveryPassword(password);
    if (typeof encrypted !== 'string' || Buffer.byteLength(encrypted) > accountBackupLimit) throw new Error();
    const data = JSON.parse(encrypted);
    // Bound work before starting a KDF; imported backups cannot choose costs.
    if (data?.format !== format || data.version !== 1 || data.cipher !== 'aes-256-gcm'
        || !data.kdf || Object.keys(kdf).some(field => data.kdf[field] !== kdf[field])
        || typeof data.ciphertext !== 'string' || data.ciphertext.length > 2048
        || data.ciphertext.length < 2 || data.ciphertext.length % 2 !== 0) throw new Error();
    const salt = decode(data.salt, 32), iv = decode(data.iv, 12), tag = decode(data.tag, 16);
    const ciphertext = decode(data.ciphertext, data.ciphertext.length / 2);
    key = await keyFor(password, salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad); decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString('utf8'));
    if (payload.version !== 1 || payload.index !== 0 || !Mnemonic.isValidMnemonic(payload.mnemonic)) throw new Error();
    return payload.mnemonic;
  } catch { throw new Error('Account backup could not be unlocked'); }
  finally { key?.fill(0); plaintext?.fill(0); }
}
