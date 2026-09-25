import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWalletDatabase } from '../src/wallet-storage.mjs';

const open = db => new Promise((resolve, reject) => db.open(error => error ? reject(error) : resolve()));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
test('disk database rejects competing writers and reopens after closure', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'honeybee-db-lock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = await createWalletDatabase(dir);
  const second = await createWalletDatabase(dir);
  await open(first);
  try { await assert.rejects(open(second), /lock|LOCK/); }
  finally { await close(first); }
  const reopened = await createWalletDatabase(dir);
  await open(reopened);
  await close(reopened);
});
test('wallet storage rejects relative paths, symlinks and public directories', async t => {
  await assert.rejects(createWalletDatabase('relative'), /absolute/);
  const root = await mkdtemp(join(tmpdir(), 'honeybee-db-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (process.platform === 'win32') return;
  const link = join(root, 'alias');
  await symlink(root, link);
  await assert.rejects(createWalletDatabase(link), /symlink/);
  await chmod(root, 0o755);
  await assert.rejects(createWalletDatabase(root), /0700/);
});
