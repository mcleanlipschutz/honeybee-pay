import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createPrivateTransferAdapter } from './private-transfer.mjs';

// Offline demonstration only. These deliberate SDK doubles cannot sign,
// generate a cryptographic proof, connect to a network or move tokens.
export async function runPaymentRuleDemo() {
  const approved = Object.freeze({ id: 'fixture-coffee-001', network: 'TEST_FIXTURE',
    recipient: '0zkFIXTURE_MERCHANT', token: '0x1111111111111111111111111111111111111111',
    amountUnits: 3000000n, expiresAt: 200 });
  const fixture = () => {
    const calls = [];
    const sdk = {
      generateTransferProof: async (...args) => { calls.push({ operation: 'proof-double', recipient: args[6][0].recipientAddress }); },
      populateProvedTransfer: async (...args) => {
        calls.push({ operation: 'populate-double', recipient: args[5][0].recipientAddress });
        return { fixtureOnly: true, recipient: args[5][0].recipientAddress };
      },
    };
    return { calls, prepare: createPrivateTransferAdapter({ sdk, txidVersion: 'TEST_FIXTURE', now: () => 100 }) };
  };
  const request = proposal => ({ approvedInvoice: approved, proposedInvoice: proposal,
    walletID: 'FIXTURE_ONLY', encryptionKey: 'NOT_A_KEY', overallBatchMinGasPrice: 0n,
    transactionGasDetails: { fixtureOnly: true }, broadcasterFee: { fixtureOnly: true } });

  const normal = fixture();
  const prepared = await normal.prepare(request({ ...approved }));
  assert.equal(prepared.status, 'prepared-not-paid');
  assert.equal(prepared.populated.recipient, approved.recipient);
  assert.equal(normal.calls.length, 2);

  const tampered = { ...approved, recipient: '0zkFIXTURE_ATTACKER' };
  // Deliberately unprotected baseline: accepts a proposal without consulting
  // approval. Kept inside this demo, never an alternate application route.
  const unprotected = { fixtureOnly: true, recipient: tampered.recipient };
  assert.notEqual(unprotected.recipient, approved.recipient);

  const protectedAttempt = fixture();
  await assert.rejects(protectedAttempt.prepare(request(tampered)), /Payment changed: recipient/);
  assert.equal(protectedAttempt.calls.length, 0);

  return { scenario: 'offline-payment-rule-comparison', version: 1,
    cases: [
      { case: 'normal-approved-request', outcome: 'prepared-for-approved-recipient', sdkDoubleCalls: normal.calls.length },
      { case: 'recipient-change-without-approval-check', outcome: 'unprotected-baseline-accepts-attacker-recipient', sdkDoubleCalls: 0 },
      { case: 'same-recipient-change-with-approval-check', outcome: 'blocked-before-proof-or-population', sdkDoubleCalls: protectedAttempt.calls.length },
    ],
    applicationRuleVerified: true, actualPromptInjectionExecuted: false,
    cryptographicProofGenerated: false, independentlyEnforcedOnchainFirewall: false,
    transactionsSignedOrBroadcast: 0, tokensMoved: false, privatePaymentSettled: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await runPaymentRuleDemo(), null, 2)); }
  catch { console.error('Offline payment-rule comparison failed.'); process.exitCode = 1; }
}
