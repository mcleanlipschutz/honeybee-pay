import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));

test('reviewed security pins cover nested packages without crossing dependency majors', () => {
  const expected = { axios: '1.18.0', dset: '3.1.4', 'bn.js': '4.12.5', 'js-yaml': '4.3.2', ws: '8.21.3' };
  const scopedMajors = { 'bn.js': '4.', 'js-yaml': '4.', ws: '8.' };
  for (const [name, version] of Object.entries(expected)) {
    const entries = Object.entries(lock.packages).filter(([location, entry]) =>
      location.endsWith(`/node_modules/${name}`) || location === `node_modules/${name}`
    ).filter(([, entry]) => !scopedMajors[name] || entry.version.startsWith(scopedMajors[name]));
    assert.ok(entries.length > 0, name);
    for (const [location, entry] of entries) {
      assert.equal(entry.version, version, location);
      assert.equal(JSON.parse(readFileSync(new URL(`../${location}/package.json`, import.meta.url))).version, version);
    }
  }
  assert.equal(lock.packages['node_modules/@railgun-community/wallet'].version, '10.9.0');
  assert.equal(lock.packages['node_modules/@railgun-community/engine'].version, '9.6.0');
  assert.equal(lock.packages['node_modules/snarkjs'].version, '0.7.5');
});

test('wallet POI requests and the application transport share the patched Axios instance', () => {
  const fromWallet = createRequire(require.resolve('@railgun-community/wallet'));
  assert.equal(fromWallet.resolve('axios'), require.resolve('axios'));
  assert.equal(require('axios').VERSION, '1.18.0');
});

test('patched parsing helpers retain normal behavior and reject prototype writes', () => {
  const { dset } = require('dset');
  const yaml = require('js-yaml');
  const value = {};
  dset(value, ['request', 'amount'], '1000000');
  assert.deepEqual(value, { request: { amount: '1000000' } });
  for (const setter of [dset, require('dset/merge').dset]) {
    for (const keys of [['__proto__', 'honeybeeSecurityFixture'],
      [['__proto__'], 'honeybeeSecurityFixture'],
      ['constructor', 'prototype', 'honeybeeSecurityFixture']]) {
      try {
        setter({}, keys, true);
        assert.equal(Object.prototype.honeybeeSecurityFixture, undefined);
      } finally { delete Object.prototype.honeybeeSecurityFixture; }
    }
  }
  const parsed = yaml.load('defaults: &defaults\n  network: sepolia\nrequest:\n  <<: *defaults\n  amount: "1000000"\n');
  assert.deepEqual(parsed.request, { network: 'sepolia', amount: '1000000' });
});

test('patched number helpers preserve exact unit conversion and handle zero-bit masks', () => {
  // A subprocess bounds the old maskn(0) infinite-loop regression.
  const result = spawnSync(process.execPath, ['--input-type=commonjs', '-e', `
    const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const units = require('ethjs-unit');
    const fromUnits = createRequire(require.resolve('ethjs-unit'));
    const BN = fromUnits('bn.js');
    assert.equal(new BN(15).maskn(0).toString(10), '0');
    assert.equal(units.toWei('1.25', 'ether').toString(10), '1250000000000000000');
    assert.equal(require('number-to-bn')('0xffff').toString(10), '65535');
  `], { cwd: new URL('..', import.meta.url), timeout: 5000, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
