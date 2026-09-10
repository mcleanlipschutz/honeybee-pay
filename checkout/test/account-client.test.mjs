import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountWalletClient, isLocalDemo, readRecoveryFile } from '../src/account-client.mjs';

const result = { account: { authenticated: true }, network: 'Ethereum_Sepolia',
  privateWallet: { status: 'locked' }, identityVerification: { verified: false, status: 'deferred-for-testnet' }, paymentReady: false };
const reply = () => new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });

test('private wallet client refuses remote destinations before obtaining credentials', () => {
  for (const origin of ['https://honeybee.example', 'http://127.0.0.1.evil.test:4173', 'http://user@127.0.0.1:4173', 'http://127.0.0.1:4173/path']) {
    assert.equal(isLocalDemo(origin), false);
    assert.throws(() => createAccountWalletClient({ origin, getAccessToken: () => { throw new Error('Must not obtain a token'); } }), /local testnet/);
  }
});

test('account changes cancel work before submission and discard late wallet responses', async () => {
  let current = true, sends = 0;
  const before = createAccountWalletClient({ origin: 'http://127.0.0.1:4173',
    getAccessToken: async () => { current = false; return 'fixture'; }, isCurrent: () => current,
    fetchImpl: async () => { sends++; return reply(); } });
  await assert.rejects(before.execute('create', { password: 'test-only-password' }), /account changed/);
  assert.equal(sends, 0);
  current = true;
  const after = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture', isCurrent: () => current,
    fetchImpl: async () => { sends++; current = false; return reply(); } });
  await assert.rejects(after.execute('status'), /account changed/);
  assert.equal(sends, 1);
});

test('failed wallet writes are not retried and remote errors cannot echo secrets', async () => {
  let calls = 0;
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture',
    fetchImpl: async (_url, options) => {
      calls++; assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
      throw new Error('raw-password-must-not-be-shown');
    } });
  await assert.rejects(client.execute('create'), { message: 'The operation was not confirmed. Refresh wallet status before trying again.' });
  assert.equal(calls, 1);
  const misleading = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture',
    fetchImpl: async () => new Response(JSON.stringify({ ...result, paymentReady: true }), { headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(misleading.execute('status'), /not confirmed/);
  await assert.rejects(readRecoveryFile({ size: 8193, text: () => { throw new Error('must not read'); } }), /smaller than 8 KB/);
});

test('private sync client rejects partial scan results and discards a different account result', async () => {
  const complete = { ...result, spendableBalanceVerified: true,
    synchronization: { status: 'history-scans-complete', scans: { utxo: 'Complete', txid: 'Complete' }, walletScanned: true, checkedAt: new Date().toISOString() },
    spendableBalance: { token: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, amountUnits: '1000000', source: 'sdk-spendable-snapshot' } };
  let current = true, next = complete;
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture', isCurrent: () => current,
    fetchImpl: async () => new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }) });
  assert.equal((await client.execute('sync', { password: 'test-password-long-enough' })).spendableBalance.amountUnits, '1000000');
  next = { ...complete, synchronization: { ...complete.synchronization, scans: { utxo: 'Complete', txid: 'Incomplete' } } };
  await assert.rejects(client.execute('sync'), /not confirmed/);
  current = false; next = complete;
  await assert.rejects(client.execute('sync'), /account changed/);
});
