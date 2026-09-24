// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 McLean Lipschutz
import assert from 'node:assert/strict';
import { ApprovalSimulator, bytes32, sampleInvoice } from './simulator.mjs';

const simulator = new ApprovalSimulator();
const invoice = sampleInvoice();
const salt = bytes32();
console.log('Honeybee Pay — Midnight invoice-approval simulation');
console.log('Compiled Compact logic; no ZK proof, deployment or payment is produced.');
simulator.execute('approve', invoice, salt);
console.log('PASS: buyer approves the exact private invoice.');
assert.throws(() => simulator.execute('consume', { ...invoice, recipient: bytes32() }, salt), /does not match/);
console.log('PASS: changed merchant is rejected.');
assert.throws(() => simulator.execute('consume', { ...invoice, amount: 1_500_000n }, salt), /does not match/);
console.log('PASS: changed amount is rejected, even below the spending ceiling.');
assert.throws(() => simulator.execute('consume', invoice, salt, bytes32()), /Unauthorized owner/);
console.log('PASS: unauthorized owner is rejected.');
simulator.execute('consume', invoice, salt);
console.log('PASS: exact approved invoice is accepted. This is not a payment receipt.');
assert.throws(() => simulator.execute('consume', invoice, salt), /already consumed/);
console.log('PASS: repeat consumption is rejected.');
console.log('Public contract state (commitments and pseudonymous authority):');
console.log(JSON.stringify(simulator.publicSnapshot(), null, 2));
