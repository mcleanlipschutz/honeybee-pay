import test from 'node:test';
import assert from 'node:assert/strict';
import { signInIssue, canReadWalletStorage } from '../src/sign-in-status.mjs';

test('initialization failures appear before a timeout and never expose provider error payloads', () => {
  const secret = 'sensitive-token-not-for-display';
  for (const [message, code] of [
    ['Origin not allowed', 'HB-A03'], ['Invalid app ID', 'HB-A04'],
    ['Failed to fetch', 'HB-A05'], ['SecurityError: localStorage', 'HB-A02'],
    ['Unexpected initialization exception', 'HB-A06'],
  ]) {
    const issue = signInIssue({ error: new Error(`${message}: ${secret}`) });
    assert.equal(issue.code, code);
    assert.ok(!JSON.stringify(issue).includes(secret));
  }
});

test('readiness and wallet loading stay distinct; a timeout never enables authentication', () => {
  assert.equal(signInIssue({}), null);
  assert.equal(signInIssue({ slow: true }).code, 'HB-A07');
  assert.equal(signInIssue({ ready: true, slow: true }), null);
  assert.equal(signInIssue({ ready: true, authenticated: true, slow: true }).code, 'HB-A08');
  assert.equal(signInIssue({ ready: true, authenticated: true, walletReady: true, slow: true }), null);
});

test('storage diagnostics are read-only and handle denied access without changing wallet data', () => {
  const data = new Map([['wallet-session', 'preserve-me']]);
  assert.equal(canReadWalletStorage(() => ({ getItem: key => data.get(key) })), true);
  assert.equal(data.get('wallet-session'), 'preserve-me');
  assert.equal(data.size, 1);
  assert.equal(canReadWalletStorage(() => { throw Error('Denied'); }), false);
  assert.equal(signInIssue({ storageAvailable: false }).code, 'HB-A02');
  assert.equal(signInIssue({ secure: false }).code, 'HB-A01');
});
