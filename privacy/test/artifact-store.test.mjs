import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPinnedArtifactStore } from '../src/artifact-store.mjs';

const data = Buffer.from('test fixture only, not a proving artifact');
const hash = createHash('sha256').update(data).digest('hex');
const name = 'artifacts-v2.1/01x02/wasm';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'honeybee-artifacts-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, store: await createPinnedArtifactStore(dir, { [name]: hash }) };
}
test('artifacts survive reopening and absent pinned files are reported missing', async t => {
  const { dir, store } = await fixture(t);
  assert.equal(await store.exists(name), false);
  assert.equal(await store.get(name), null);
  await store.store('ignored', name, data);
  const reopened = await createPinnedArtifactStore(dir, { [name]: hash });
  assert.deepEqual(await reopened.get(name), data);
  assert.equal(await reopened.exists(name), true);
});
test('unreviewed paths cannot read or write outside the artifact cache', async t => {
  const { dir, store } = await fixture(t);
  for (const path of ['../../escape', '/tmp/escape', '__proto__']) {
    await assert.rejects(store.get(path), /reviewed manifest/);
    await assert.rejects(store.store('', path, data), /reviewed manifest/);
  }
  assert.deepEqual(await readdir(dir), []);
});
test('incorrect downloads cannot overwrite a verified artifact', async t => {
  const { store } = await fixture(t);
  await store.store('', name, data);
  await assert.rejects(store.store('', name, 'altered'), /integrity/);
  assert.deepEqual(await store.get(name), data);
});
test('tampered cached bytes fail both get and exists', async t => {
  const { dir, store } = await fixture(t);
  await store.store('', name, data);
  await writeFile(join(dir, hash), 'altered');
  await assert.rejects(store.get(name), /integrity/);
  await assert.rejects(store.exists(name), /integrity/);
});
test('manifest mutations after initialization do not change trust', async t => {
  const { dir } = await fixture(t);
  const manifest = { [name]: hash };
  const store = await createPinnedArtifactStore(dir, manifest);
  manifest.extra = hash;
  await assert.rejects(store.get('extra'), /reviewed manifest/);
  await assert.rejects(createPinnedArtifactStore(dir, { [name]: '../invalid' }), /Invalid artifact pin/);
});
