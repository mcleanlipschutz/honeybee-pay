import { mkdir, lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import leveldown from 'leveldown';

// The SDK encrypts wallet seed records. Synced transaction metadata is not
// necessarily encrypted: use a dedicated private directory on a trusted disk.
export async function createWalletDatabase(directory) {
  if (typeof directory !== 'string' || !isAbsolute(directory)) {
    throw new Error('Wallet database requires an absolute directory path');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Wallet directory must not be a symlink');
  if (process.platform !== 'win32') {
    if ((info.mode & 0o777) !== 0o700 || info.uid !== process.getuid()) {
      throw new Error('Wallet directory must be owned by the current user with mode 0700');
    }
  }
  // LevelDB supplies a native lock so another engine cannot open the same
  // database concurrently. Shutdown via stopRailgunEngine releases the lock.
  return leveldown(directory);
}
