export const requestHistoryFileLimit = 262144;
export const historyRestoreBodyLimit = requestHistoryFileLimit + 4096;
export const historyBackupFormat = 'honeybee-merchant-request-history';

// This only validates the encrypted envelope. Authentication and decryption
// require the recovered wallet root inside the isolated account worker.
export function validateHistoryBackup(text) {
  const fail = () => { throw new Error('Choose a valid encrypted Honeybee request-history backup, up to 256 KB.'); };
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > requestHistoryFileLimit) fail();
  let value;
  try { value = JSON.parse(text); } catch { fail(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'cipher,ciphertext,format,iv,kdf,salt,tag,version'
      || value.format !== historyBackupFormat || value.version !== 1 || value.cipher !== 'aes-256-gcm' || value.kdf !== 'hkdf-sha256'
      || typeof value.ciphertext !== 'string' || value.ciphertext.length < 2 || value.ciphertext.length % 2 !== 0
      || !/^[a-f0-9]+$/.test(value.ciphertext)
      || typeof value.salt !== 'string' || !/^[a-f0-9]{64}$/.test(value.salt)
      || typeof value.iv !== 'string' || !/^[a-f0-9]{24}$/.test(value.iv)
      || typeof value.tag !== 'string' || !/^[a-f0-9]{32}$/.test(value.tag)
      || JSON.stringify(value) !== text.trim()) fail();
  return JSON.stringify(value);
}

export function createHistoryBackupReader({ isCurrent }) {
  let generation = 0;
  return { clear() { generation++; }, async read(file) {
    const operation = ++generation;
    const current = () => { if (operation !== generation || !isCurrent()) throw new Error('Your account or backup selection changed. Choose the file again.'); };
    current();
    if (!file || file.size < 1 || file.size > requestHistoryFileLimit) throw new Error('Choose an encrypted request-history backup up to 256 KB.');
    const text = await file.text();
    current();
    return validateHistoryBackup(text);
  } };
}
