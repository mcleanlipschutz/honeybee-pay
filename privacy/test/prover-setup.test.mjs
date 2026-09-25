import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { brotliCompressSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { decodeArtifact } from '../src/prepare-proof-artifacts.mjs';
import { proofArtifacts } from '../src/proof-artifacts.mjs';

const require = createRequire(import.meta.url);
test('proving WASM and key pins match the installed SDK trusted hashes', async () => {
  const sdkRoot = dirname(require.resolve('@railgun-community/wallet'));
  const sdkHashes = JSON.parse(await readFile(join(sdkRoot,
    'services/artifacts/json/artifact-v2-hashes.json'), 'utf8'));
  for (const artifact of proofArtifacts.filter(a => a.name !== 'vkey.json')) {
    assert.equal(artifact.sha256, sdkHashes['01x02'][artifact.name]);
  }
});
test('artifact decoder rejects substituted downloads and incorrect decompressed hashes', () => {
  const data = Buffer.from('test artifact');
  const compressed = brotliCompressSync(data);
  const pin = { file: 'wasm.br', bytes: data.length,
    gitBlob: createHash('sha1').update(`blob ${compressed.length}\0`).update(compressed).digest('hex'),
    sha256: createHash('sha256').update(data).digest('hex') };
  assert.deepEqual(decodeArtifact(compressed, pin), data);
  assert.throws(() => decodeArtifact(Buffer.from('substitution'), pin), /blob mismatch/);
  assert.throws(() => decodeArtifact(compressed, { ...pin, sha256: '0'.repeat(64) }), /integrity mismatch/);
  assert.throws(() => decodeArtifact(compressed, { ...pin, bytes: 1 }));
});
test('patched jsonpath dependency handles deep flattening and bfj parses normal prover JSON', async () => {
  const jsonpath = require('jsonpath');
  const nestedRequire = createRequire(require.resolve('jsonpath'));
  const underscore = nestedRequire('underscore');
  let nested = [1];
  for (let i = 0; i < 10000; i++) nested = [nested];
  assert.deepEqual(underscore.flatten(nested), [1]);
  assert.deepEqual(jsonpath.query({ values: [{ amount: '2000000' }, { amount: '8000000' }] },
    '$.values[*].amount'), ['2000000', '8000000']);
  const parsed = await require('bfj').parse(Readable.from(['{"publicSignals":["1",', '"2"]}']));
  assert.deepEqual(parsed, { publicSignals: ['1', '2'] });
});
