// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODULE_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const LOGIC_ARTIFACTS = ['contract/index.js', 'zkir/approve.zkir', 'zkir/consume.zkir'];
export const PROOF_ARTIFACTS = ['keys/approve.prover', 'keys/approve.verifier', 'keys/consume.prover', 'keys/consume.verifier'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyBuild({ root = MODULE_ROOT, requireFull = true } = {}) {
  const output = join(root, 'managed/approval');
  const fail = () => { throw new Error('Compact artifacts are missing, stale or changed. Run the full npm run compile.'); };
  try {
    const build = JSON.parse(readFileSync(join(output, 'build.json'), 'utf8'));
    const installed = JSON.parse(readFileSync(join(root, 'node_modules/@midnight-ntwrk/compact-runtime/package.json'), 'utf8'));
    if (build.compiler !== '0.31.1' || build.runtime !== '0.16.0' || installed.version !== build.runtime
      || typeof build.fullBuild !== 'boolean' || (requireFull && !build.fullBuild)
      || build.sourceSha256 !== digest(readFileSync(join(root, 'contracts/approval.compact')))) fail();
    const required = [...LOGIC_ARTIFACTS, ...(build.fullBuild ? PROOF_ARTIFACTS : [])];
    for (const name of required) {
      const path = join(output, name), stat = lstatSync(path);
      if (!stat.isFile() || stat.size === 0 || !/^[0-9a-f]{64}$/.test(build.artifacts?.[name] || '')
        || build.artifacts[name] !== digest(readFileSync(path))) fail();
    }
    return { compiler: build.compiler, runtime: build.runtime, fullBuild: build.fullBuild,
      sourceSha256: build.sourceSha256, artifactCount: required.length };
  } catch { fail(); }
}
