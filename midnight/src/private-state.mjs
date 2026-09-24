// SPDX-License-Identifier: Apache-2.0
// Node-only test integration storage. Uses the official SDK's encryption/backup.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, open, readFile, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { serialize } from 'node:v8';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { verifyBuild } from './verify-build.mjs';

export async function openApprovalState({ directory, accountId, contractAddress, network, getPassword }) {
  if (!isAbsolute(directory || '') || !['preview', 'undeployed'].includes(network)
    || typeof accountId !== 'string' || accountId.trim() !== accountId || !accountId || accountId.length > 512
    || !/^[0-9a-f]{64}$/.test(contractAddress || '') || typeof getPassword !== 'function')
    throw new Error('A dedicated local test-state directory and explicit account, network and contract are required.');
  const build = verifyBuild();
  const binding = createHash('sha256').update(JSON.stringify([
    'honeybee:midnight-state:v1', network, accountId, contractAddress, build.sourceSha256,
  ])).digest('hex');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32'
    && ((info.mode & 0o777) !== 0o700 || info.uid !== process.getuid())))
    throw new Error('Private state needs an owner-only directory, not a shared directory or symlink.');
  const provider = levelPrivateStateProvider({ midnightDbName: join(directory, binding), accountId,
    privateStateStoreName: 'honeybee-approval-state', signingKeyStoreName: 'honeybee-unused-signing-keys',
    privateStoragePasswordProvider: getPassword });
  provider.setContractAddress(contractAddress);
  const exclusive = async action => {
    const path = join(directory, binding + '.lock');
    let handle;
    try { handle = await open(path, 'wx', 0o600); }
    catch { throw new Error('Private state is busy or a prior operation needs recovery. No state was replaced.'); }
    const token = randomUUID();
    try { await handle.writeFile(token); return await action(); }
    finally {
      await handle.close();
      // A crashed or replaced lock is never silently cleared by another process.
      if (await readFile(path, 'utf8').catch(() => null) === token) await unlink(path);
    }
  };
  const stateId = 'honeybee-approval-v2';
  const validate = state => {
    if (!(state?.ownerSecret instanceof Uint8Array) || state.ownerSecret.length !== 32
      || state.ownerSecret.every(v => v === 0) || serialize(state).byteLength > 1_048_576)
      throw new Error('Invalid private approval state.');
    return state;
  };
  const read = async () => {
    const record = await provider.get(stateId);
    if (record === null) return null;
    if (record?.binding !== binding) throw new Error('This private state belongs to another integration context.');
    return validate(record.state);
  };
  return Object.freeze({
    read: () => exclusive(read),
    async initialize(state) {
      return exclusive(async () => {
      // Never silently replace an existing owner secret with a new random one.
      if (await read() !== null) throw new Error('Private state already exists. Recover it instead of replacing it.');
      await provider.set(stateId, { binding, state: validate(structuredClone(state)) });
      });
    },
    async backup(password) {
      return exclusive(async () => {
      if (await read() === null) throw new Error('No private state to back up.');
      return { format: 'honeybee-midnight-backup-v1', binding,
        encrypted: await provider.exportPrivateStates({ password, maxStates: 1 }) };
      });
    },
    async restore(backup, password) {
      return exclusive(async () => {
      if (backup?.format !== 'honeybee-midnight-backup-v1' || backup.binding !== binding
        || serialize(backup).byteLength > 2_097_152) throw new Error('Backup does not match this integration context.');
      if (await read() !== null) throw new Error('Recovery cannot overwrite existing private state.');
      await provider.importPrivateStates(backup.encrypted, { password, conflictStrategy: 'error', maxStates: 1 });
      if (await read() === null) throw new Error('Backup did not contain the expected approval state.');
      });
    },
    async lock() { await exclusive(() => provider.invalidateEncryptionCache()); },
  });
}
