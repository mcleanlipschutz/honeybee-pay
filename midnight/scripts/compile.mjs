// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 McLean Lipschutz
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const expected = '0.31.1';
const root = fileURLToPath(new URL('../', import.meta.url));
const binary = process.env.HONEYBEE_COMPACTC || 'compact';
const prefix = process.env.HONEYBEE_COMPACTC ? [] : ['compile'];
const run = (args, options = {}) => spawnSync(binary, [...prefix, ...args], {
  cwd: root, encoding: 'utf8', ...options,
});
const version = run(['--version']);
if (version.error || version.status !== 0) {
  console.error('Compact compiler unavailable. Install Compact and run compact update 0.31.1.');
  process.exit(1);
}
if (!new RegExp(`(^|\\s)${expected.replaceAll('.', '\\.')}($|\\s)`).test(version.stdout.trim())) {
  console.error(`Expected Compact compiler ${expected}; found ${version.stdout.trim()}.`);
  process.exit(1);
}
const args = process.argv.slice(2);
if (args.some((value) => value !== '--skip-zk') || args.length > 1) {
  console.error('Usage: npm run compile [-- --skip-zk]');
  process.exit(1);
}
console.log(`Compact compiler ${expected}; ${args.length ? 'logic-only build (no proving keys)' : 'full circuit and key build'}.`);
const output = join(root, 'managed/approval');
// Delete generated output only, so a failed build cannot leave stale passing artifacts.
rmSync(output, { recursive: true, force: true });
const result = run([...args, 'contracts/approval.compact', 'managed/approval'], { stdio: 'inherit' });
if (result.error || result.status !== 0) process.exit(result.status ?? 1);
const artifacts = ['contract/index.js', 'zkir/approve.zkir', 'zkir/consume.zkir'];
if (!args.length) {
  artifacts.push('keys/approve.prover', 'keys/approve.verifier', 'keys/consume.prover', 'keys/consume.verifier');
}
for (const artifact of artifacts) {
  const path = join(output, artifact);
  if (!existsSync(path) || statSync(path).size === 0) {
    console.error(`Compiler did not produce required artifact: ${artifact}`);
    process.exit(1);
  }
}
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = {
  compiler: expected, runtime: '0.16.0', fullBuild: !args.length,
  sourceSha256: digest(join(root, 'contracts/approval.compact')),
  artifacts: Object.fromEntries(artifacts.map((path) => [path, digest(join(output, path))])),
};
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'build.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Verified ${artifacts.length} nonempty artifacts. No proof was generated or submitted.`);
