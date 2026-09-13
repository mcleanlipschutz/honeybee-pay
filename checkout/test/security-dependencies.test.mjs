import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('checkout pins every ws 8 consumer while preserving the separate ws 7 API', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  const entries = Object.entries(lock.packages).filter(([name]) => /(?:^|\/)node_modules\/ws$/.test(name));
  assert.ok(entries.some(([, value]) => value.version.startsWith('8.')));
  assert.ok(entries.some(([, value]) => value.version.startsWith('7.')));
  for (const [name, value] of entries) {
    assert.ok(['8.21.3', '7.5.13'].includes(value.version), name);
    assert.equal(JSON.parse(readFileSync(new URL(`../${name}/package.json`, import.meta.url))).version, value.version);
  }
  assert.equal(lock.packages['node_modules/@privy-io/react-auth'].version, '3.42.0');
  assert.equal(lock.packages['node_modules/viem'].version, '2.56.3');
});
