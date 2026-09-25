import { mkdir, lstat, realpath, rmdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

// The parent owns this lease and releases it only after the isolated worker has
// exited. A killed worker cannot strand its lease in a still-running server.
// Existing locks (including locks from an older server) are never reclaimed.
export async function withAccountLock(directory, ownerId, operation) {
  if (!isAbsolute(directory) || !/^[a-f0-9]{64}$/.test(ownerId)) throw new Error('Invalid account storage');
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink() || await realpath(directory) !== directory
      || (process.platform !== 'win32' && ((root.mode & 0o777) !== 0o700 || root.uid !== process.getuid()))) {
    throw new Error('Account storage requires a private canonical directory');
  }
  const path = join(directory, `${ownerId}.lock`);
  await mkdir(path, { mode: 0o700 });
  const lease = await lstat(path);
  try { return await operation(); }
  finally {
    const current = await lstat(path);
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== lease.dev || current.ino !== lease.ino) {
      throw new Error('Account lock changed; manual recovery required');
    }
    // No recursive deletion: unexpected contents preserve the lock for review.
    await rmdir(path);
  }
}
