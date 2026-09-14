// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 McLean Lipschutz
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalSimulator, bytes32, sampleInvoice } from '../src/simulator.mjs';

function fixture() {
  const simulator = new ApprovalSimulator();
  const invoice = sampleInvoice();
  const salt = bytes32();
  return { simulator, invoice, salt };
}

test('approved exact invoice can be consumed once', () => {
  const { simulator, invoice, salt } = fixture();
  simulator.execute('approve', invoice, salt);
  assert.equal(simulator.state.approved.size(), 1n);
  assert.equal(simulator.state.consumed.size(), 0n);
  simulator.execute('consume', invoice, salt);
  assert.equal(simulator.state.consumed.member(simulator.commitment(invoice, salt)), true);
  const before = simulator.publicSnapshot();
  assert.throws(() => simulator.execute('consume', invoice, salt), /already consumed/);
  assert.throws(() => simulator.execute('approve', invoice, salt), /already approved/);
  assert.deepEqual(simulator.publicSnapshot(), before);
});

test('unapproved invoice cannot be consumed', () => {
  const { simulator, invoice, salt } = fixture();
  assert.throws(() => simulator.execute('consume', invoice, salt), /does not match/);
  assert.equal(simulator.state.consumed.size(), 0n);
});

for (const field of ['invoiceId', 'recipient', 'asset', 'chainId', 'amount', 'maximum']) {
  test(`changing ${field} invalidates an existing approval`, () => {
    const { simulator, invoice, salt } = fixture();
    simulator.execute('approve', invoice, salt);
    const altered = { ...invoice, [field]: typeof invoice[field] === 'bigint' ? invoice[field] + 1n : bytes32() };
    const before = simulator.publicSnapshot();
    assert.throws(() => simulator.execute('consume', altered, salt), /does not match/);
    assert.deepEqual(simulator.publicSnapshot(), before);
    simulator.execute('consume', invoice, salt);
  });
}

test('wrong salt cannot open an approval', () => {
  const { simulator, invoice, salt } = fixture();
  simulator.execute('approve', invoice, salt);
  assert.throws(() => simulator.execute('consume', invoice, bytes32()), /does not match/);
});

for (const action of ['approve', 'consume']) {
  test(`a malicious witness cannot ${action} for the owner`, () => {
    const { simulator, invoice, salt } = fixture();
    if (action === 'consume') simulator.execute('approve', invoice, salt);
    const before = simulator.publicSnapshot();
    assert.throws(() => simulator.execute(action, invoice, salt, bytes32()), /Unauthorized owner/);
    assert.deepEqual(simulator.publicSnapshot(), before);
    simulator.execute(action, invoice, salt);
  });
}

test('zero and over-limit amounts fail in the contract', () => {
  const { simulator, invoice, salt } = fixture();
  assert.throws(() => simulator.execute('approve', { ...invoice, amount: 0n }, salt), /positive/);
  assert.throws(() => simulator.execute('approve', { ...invoice, amount: invoice.maximum + 1n }, salt), /limit/);
  assert.equal(simulator.state.approved.size(), 0n);
  simulator.execute('approve', { ...invoice, amount: invoice.maximum }, salt);
});

test('invalid identifiers and an empty salt fail before approval', () => {
  const { simulator, invoice, salt } = fixture();
  for (const field of ['invoiceId', 'recipient', 'asset']) {
    assert.throws(() => simulator.execute('approve', { ...invoice, [field]: new Uint8Array(32) }, salt), /Empty/);
  }
  assert.throws(() => simulator.execute('approve', { ...invoice, chainId: 0n }, salt), /Invalid chain/);
  assert.throws(() => simulator.execute('approve', invoice, new Uint8Array(32)), /Empty invoice salt/);
  assert.equal(simulator.state.approved.size(), 0n);
});

test('uint64 limits reject negative, overflowing and fractional values', () => {
  const { simulator, invoice, salt } = fixture();
  for (const amount of [-1n, 2n ** 64n, 0.5]) {
    assert.throws(() => simulator.execute('approve', { ...invoice, amount }, salt));
  }
});

test('fresh salts and separate instances produce distinct commitments', () => {
  const { simulator, invoice, salt } = fixture();
  const other = new ApprovalSimulator();
  assert.notDeepEqual(simulator.commitment(invoice, salt), simulator.commitment(invoice, bytes32()));
  assert.notDeepEqual(simulator.commitment(invoice, salt), other.commitment(invoice, salt));
  simulator.execute('approve', invoice, salt);
  assert.throws(() => other.execute('consume', invoice, salt), /does not match/);
});

test('public ledger contains commitments, without raw invoice fields, salt or owner secret', () => {
  const { simulator, invoice, salt } = fixture();
  const secret = simulator.context.currentPrivateState.ownerSecret;
  simulator.execute('approve', invoice, salt);
  simulator.execute('consume', invoice, salt);
  const state = simulator.state;
  assert.deepEqual(Object.keys(state).sort(), ['approved', 'authority', 'consumed', 'instance']);
  const serialized = JSON.stringify(simulator.publicSnapshot());
  for (const value of [invoice.invoiceId, invoice.recipient, invoice.asset, salt, secret]) {
    assert.equal(serialized.includes(Buffer.from(value).toString('hex')), false);
  }
  assert.equal(state.approved.size(), 1n);
  assert.equal(state.consumed.size(), 1n);
  // This checks ledger contents, not network metadata or cryptographic ZK.
});
