import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

function command(args, password) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/test-wallet-cli.mjs', ...args], {
      cwd: new URL('..', import.meta.url), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', data => out += data);
    child.stderr.on('data', data => err += data);
    child.on('error', reject);
    child.on('close', code => resolve({ code, out, err }));
    child.stdin.end(password + '\n');
  });
}
test('fresh-process test workspace recovery preserves roles and rejects wrong passwords and overwrite', { timeout: 60000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'honeybee-workspace-'));
  const password = randomBytes(24).toString('hex');
  const directory = join(temporary, 'original');
  try {
    const created = await command(['init', directory], password);
    assert.equal(created.code, 0, created.err);
    const initial = JSON.parse(created.out);
    assert.deepEqual(initial.wallets.map(w => w.role), ['buyer', 'merchant', 'attacker']);
    assert.equal(new Set(initial.wallets.map(w => w.privateAddress)).size, 3);
    assert.equal(new Set(initial.wallets.map(w => w.publicAddress)).size, 3);
    const reopened = await command(['status', directory], password);
    assert.equal(reopened.code, 0, reopened.err);
    assert.deepEqual(JSON.parse(reopened.out).wallets, initial.wallets);
    const backup = join(directory, 'root.keystore.json');
    const before = await readFile(backup, 'utf8');
    assert.equal((await command(['status', directory], 'wrong-password-long-enough')).code, 1);
    assert.equal((await command(['init', directory], password)).code, 1);
    assert.equal(await readFile(backup, 'utf8'), before);
    const restored = await command(['restore', join(temporary, 'restored'), backup], password);
    assert.equal(restored.code, 0, restored.err);
    assert.deepEqual(JSON.parse(restored.out).wallets, initial.wallets);
    assert.equal(JSON.parse(restored.out).synchronized, false);
    assert.equal(JSON.parse(restored.out).paymentReady, false);
    for (const output of [created.out, reopened.out, restored.out, before]) assert.ok(!output.includes(password));
    if (process.platform !== 'win32') assert.equal((await stat(backup)).mode & 0o777, 0o600);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
