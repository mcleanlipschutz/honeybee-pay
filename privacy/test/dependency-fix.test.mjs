import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('@railgun-community/circomlibjs'));
test('installed fork preserves every upstream non-manifest file', () => {
  const hashes = JSON.parse(readFileSync(new URL('../vendor/UPSTREAM-HASHES.json', import.meta.url)));
  for (const [file, digest] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'), digest, file);
  }
});
test('Poseidon matches two upstream reference vectors', () => {
  const { poseidon } = require('@railgun-community/circomlibjs');
  assert.equal(poseidon([1, 2]).toString(16), '115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a');
  assert.equal(poseidon([1, 2, 3, 4]).toString(16), '299c867db6c1fdd79dcefa40e4510b9837e60ebb1ce0663dbaa525df65250465');
});
test('lockfile excludes legacy runtime dependency chain', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  const forbidden = /(?:^|\/)node_modules\/(?:tar|swarm-js|web3|web3-bzz|request|servify)$/;
  assert.deepEqual(Object.keys(lock.packages).filter(name => forbidden.test(name)), []);
  const fromEngine = createRequire(require.resolve('@railgun-community/engine'));
  assert.equal(fromEngine.resolve('@railgun-community/circomlibjs'), require.resolve('@railgun-community/circomlibjs'));
});
