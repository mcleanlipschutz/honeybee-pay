import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUSDC, snapshotInvoice, createPrivateTransferAdapter } from '../src/private-transfer.mjs';

// Deliberate SDK test doubles: NO cryptography or token movement is tested here.
function fixture() {
  const calls = [];
  const sdk = {
    async generateTransferProof(...args) { calls.push(['prove', args]); },
    async populateProvedTransfer(...args) { calls.push(['populate', args]); return { testDouble: true }; },
  };
  let clock = 100;
  const invoice = { id: 'coffee-001', network: 'test-fixture', recipient: '0zkTEST_ONLY',
    token: '0x1111111111111111111111111111111111111111', amountUnits: 3_000_000n, expiresAt: 200 };
  const request = { approvedInvoice: invoice, proposedInvoice: { ...invoice }, walletID: 'TEST_ONLY',
    encryptionKey: 'TEST_ONLY', overallBatchMinGasPrice: 1n,
    transactionGasDetails: { testOnly: true }, broadcasterFee: { testOnly: true } };
  const prepare = createPrivateTransferAdapter({ sdk, txidVersion: 'TEST_ONLY', now: () => clock });
  return { sdk, calls, invoice, request, prepare, setClock(value) { clock = value; } };
}

test('USDC decimal input becomes exact integer units', () => {
  assert.equal(parseUSDC('3'), 3_000_000n);
  assert.equal(parseUSDC('0.000001'), 1n);
  assert.equal(parseUSDC('3.10'), 3_100_000n);
});
test('ambiguous, negative, zero and over-precision amounts fail', () => {
  for (const value of ['0', '-3', '3e6', '3.0000001', ' 3', '03', 'Infinity', 3]) {
    assert.throws(() => parseUSDC(value));
  }
});
test('approval snapshot cannot be changed through the original object', () => {
  const f = fixture(); const saved = snapshotInvoice(f.invoice);
  f.invoice.amountUnits = 9n;
  assert.equal(saved.amountUnits, 3_000_000n);
  assert.ok(Object.isFrozen(saved));
});
for (const [key, value] of Object.entries({ id: 'other', network: 'other', recipient: '0zkATTACKER',
  token: '0x2222222222222222222222222222222222222222', amountUnits: 4_000_000n, expiresAt: 201 })) {
  test(`changed ${key} is blocked before proof generation`, async () => {
    const f = fixture(); f.request.proposedInvoice[key] = value;
    await assert.rejects(f.prepare(f.request), /Payment changed/);
    assert.equal(f.calls.length, 0);
  });
}
test('public recipient is rejected', async () => {
  const f = fixture(); f.request.proposedInvoice.recipient = f.invoice.token;
  await assert.rejects(f.prepare(f.request), /private RAILGUN/);
});
test('expiry equality is rejected', async () => {
  const f = fixture(); f.setClock(200);
  await assert.rejects(f.prepare(f.request), /expired/);
  assert.equal(f.calls.length, 0);
});
test('expiry during proving blocks transaction preparation', async () => {
  const f = fixture(); f.sdk.generateTransferProof = async () => f.setClock(200);
  await assert.rejects(f.prepare(f.request), /expired/);
  assert.equal(f.calls.length, 0);
});
test('proof failure propagates and never populates', async () => {
  const f = fixture(); f.sdk.generateTransferProof = async () => { throw new Error('Proof failed'); };
  await assert.rejects(f.prepare(f.request), /Proof failed/);
  assert.equal(f.calls.length, 0);
});
test('same approved recipients and privacy flags reach both SDK calls', async () => {
  const f = fixture(); const result = await f.prepare(f.request);
  assert.equal(result.status, 'prepared-not-paid');
  const [, prove] = f.calls[0]; const [, populate] = f.calls[1];
  assert.deepEqual(prove[6], populate[5]);
  assert.equal(prove[4], false); assert.equal(populate[3], false);
  assert.equal(prove[9], false); assert.equal(populate[8], false);
  assert.equal(prove[5], undefined); assert.equal(populate[4], undefined);
});
test('mutation during asynchronous proving cannot replace the recipient', async () => {
  const f = fixture(); f.sdk.generateTransferProof = async () => {
    f.request.proposedInvoice.recipient = '0zkATTACKER';
  };
  await f.prepare(f.request);
  assert.equal(f.calls[0][1][5][0].recipientAddress, '0zkTEST_ONLY');
});
test('overlapping proof requests are rejected', async () => {
  const f = fixture(); let release;
  f.sdk.generateTransferProof = () => new Promise(resolve => { release = resolve; });
  const first = f.prepare(f.request);
  await assert.rejects(f.prepare(f.request), /already in progress/);
  release(); await first;
});
