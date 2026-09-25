import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ArtifactStore } from '@railgun-community/wallet';

const digest = data => createHash('sha256').update(data).digest('hex');

// The manifest must come from separately reviewed upstream artifacts. Never
// derive trusted hashes from an unverified download in this adapter.
export async function createPinnedArtifactStore(directory, manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Artifact manifest must be an object');
  }
  const pins = new Map(Object.entries(manifest));
  for (const [name, hash] of pins) {
    if (!name || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error('Invalid artifact pin');
    }
  }
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  function pin(name) {
    if (!pins.has(name)) throw new Error('Artifact is not in the reviewed manifest');
    return pins.get(name);
  }
  async function get(name) {
    const expected = pin(name);
    let data;
    try { data = await readFile(join(root, expected)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (digest(data) !== expected) throw new Error('Artifact integrity check failed');
    return data;
  }
  return new ArtifactStore(get, async (_dir, name, item) => {
    const expected = pin(name);
    const data = Buffer.from(item);
    if (digest(data) !== expected) throw new Error('Artifact integrity check failed');
    // Logical SDK paths never become filesystem paths. Atomic replacement
    // avoids exposing partially written proving files to another reader.
    const temporary = join(root, `${expected}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(root, expected));
    } finally { await rm(temporary, { force: true }); }
  }, async name => (await get(name)) !== null);
}
