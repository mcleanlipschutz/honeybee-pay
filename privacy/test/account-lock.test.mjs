import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { withAccountLock } from '../src/account-lock.mjs';

test('a killed process releases only its owned account lease, preserving wallet data', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'hb-lease-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const owner = 'ab'.repeat(32), slot = join(directory, owner);
  await mkdir(slot, { mode: 0o700 });
  await writeFile(join(slot, 'recovery-fixture'), 'preserve this backup', { mode: 0o600 });
  await assert.rejects(withAccountLock(directory, owner, async () => {
    await assert.rejects(withAccountLock(directory, owner, () => assert.fail('Competing access')));
    const child = spawn(process.execPath, ['-e', 'process.send("ready");setInterval(()=>{},1000)'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    await once(child, 'message'); const exited = once(child, 'close');
    child.kill('SIGKILL'); await exited;
    throw new Error('Scan worker terminated');
  }), /terminated/);
  await withAccountLock(directory, owner, async () => assert.equal(await readFile(join(slot, 'recovery-fixture'), 'utf8'), 'preserve this backup'));
  assert.deepEqual(await readdir(directory), [owner]);
});

test('existing locks and unexpected lock contents remain for manual review', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'hb-lease-existing-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const owner = 'cd'.repeat(32), path = join(directory, `${owner}.lock`);
  await mkdir(path, { mode: 0o700 });
  await assert.rejects(withAccountLock(directory, owner, () => assert.fail('Must not reclaim existing lock')));
  await rm(path, { recursive: true });
  await assert.rejects(withAccountLock(directory, owner, () => writeFile(join(path, 'unexpected'), 'keep')));
  assert.equal(await readFile(join(path, 'unexpected'), 'utf8'), 'keep');
});
