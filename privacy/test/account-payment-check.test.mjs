import test from 'node:test';
import assert from 'node:assert/strict';
import { RailgunEngine } from '@railgun-community/engine';
import { checkAccountPayment } from '../src/account-payment-check.mjs';
import { createAccountInvoice, invoiceValidation } from '../src/account-invoice.mjs';
import { validatePrivatePaymentCheck, validateSpendableSnapshot } from '../../shared/private-payment-check.mjs';
import { createAccountWalletClient } from '../../checkout/src/account-client.mjs';

const address = key => RailgunEngine.encodeAddress({ masterPublicKey: BigInt(key), viewingPublicKey: new Uint8Array(32).fill(key) });
const buyer = { id: 'fixture-buyer', railgunAddress: address(2) };
const merchant = { id: 'fixture-merchant', railgunAddress: address(3) };
const wallet = { status: 'locked', id: buyer.id, privateAddress: buyer.railgunAddress };
const request = (now, extra = {}) => createAccountInvoice({ wallet: merchant, amount: '1.25', lifetimeSeconds: 3600,
  now: Math.floor(now / 1000), checkSession() {}, ...extra }).paymentRequest;
const snapshot = (now, units = '1250000') => ({
  synchronization: { status: 'history-scans-complete', scans: { utxo: 'Complete', txid: 'Complete' },
    checkedAt: new Date(now).toISOString(), walletScanned: true },
  spendableBalanceVerified: true, paymentReady: false,
  spendableBalance: { token: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, amountUnits: units, source: 'sdk-spendable-snapshot' },
});
const response = value => ({ account: { authenticated: true }, network: 'Ethereum_Sepolia',
  identityVerification: { verified: false, status: 'deferred-for-testnet' }, networkLoaded: false,
  privateWallet: wallet, ...value });
const run = (now, options = {}) => checkAccountPayment({ paymentRequest: request(now), wallet: buyer,
  expiresAt: now + 3600000, checkSession() {}, now: () => now, scan: async () => snapshot(now), ...options });

test('a fresh account scan compares exact private units and never authorizes payment', async () => {
  const now = Date.now();
  for (const [units, covers, shortfall] of [['0', false, '1250000'], ['1249999', false, '1'], ['1250000', true, '0'], ['2000000', true, '0']]) {
    const result = await run(now, { scan: async options => {
      assert.equal(options.wallet, buyer); return snapshot(now, units);
    } });
    assert.equal(result.paymentCheck.coversRequestedAmount, covers);
    assert.equal(result.paymentCheck.shortfallUnits, shortfall);
    assert.equal(result.paymentCheck.walletId, buyer.id);
    assert.equal(result.paymentCheck.request.recipient, merchant.railgunAddress);
    assert.equal(result.paymentCheck.expiresAt, now + 60000);
    assert.equal(result.paymentCheck.feesChecked, false);
    assert.equal(result.paymentCheck.submissionEnabled, false);
    assert.equal(result.paymentReady, false);
    assert.ok(result.blockers.includes('private-payment-fees-not-checked'));
    assert.equal(result.blockers.includes('insufficient-private-test-usdc'), !covers);
  }
});

test('checks expire at the earliest of scan lifetime, request expiry and account session', async () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  assert.equal((await run(now, { expiresAt: now + 10000 })).paymentCheck.expiresAt, now + 10000);
  const ending = request(now, { now: now / 1000 - 890, lifetimeSeconds: 900 });
  assert.equal((await run(now, { paymentRequest: ending })).paymentCheck.expiresAt, now + 10000);
  let clock = now;
  await assert.rejects(run(now, { paymentRequest: ending, now: () => clock,
    scan: async () => { clock += 11000; return snapshot(clock); } }));
  await assert.rejects(run(now, { expiresAt: now }));
  let current = true;
  await assert.rejects(run(now, { checkSession() { if (!current) throw Error('session expired'); },
    scan: async () => { current = false; return snapshot(now); } }), /session expired/);
});

test('invalid merchant requests fail before scanning and reviewed terms are immutable across awaits', async () => {
  const now = Date.now(); let scans = 0;
  const original = request(now);
  for (const change of [{ recipient: buyer.railgunAddress }, { amountUnits: '9000000' }, { chainId: 1 }, { expiresAt: 1 }, { digest: 'invalid' }]) {
    await assert.rejects(run(now, { paymentRequest: { ...original, ...change }, scan: async () => { scans++; } }));
  }
  assert.equal(scans, 0);
  const mutable = { ...original };
  const result = await run(now, { paymentRequest: mutable, scan: async () => { mutable.amountUnits = '9999999'; return snapshot(now); } });
  assert.equal(result.paymentCheck.request.amountUnits, '1250000');
  assert.ok(Object.isFrozen(result.paymentCheck.request));
});

test('missing, stale, incomplete and impossible spendable snapshots fail closed', async () => {
  const now = Date.now(), good = snapshot(now);
  const invalid = [null, { ...good, paymentReady: true }, { ...good, spendableBalanceVerified: false },
    { ...good, synchronization: { ...good.synchronization, walletScanned: false } },
    { ...good, synchronization: { ...good.synchronization, scans: { utxo: 'Complete', txid: 'Incomplete' } } },
    snapshot(now - 1), snapshot(now + 5001)];
  for (const units of ['-1', '01', '1.25', 1, (2n ** 256n).toString()]) invalid.push(snapshot(now, units));
  for (const value of invalid) {
    assert.throws(() => validateSpendableSnapshot(value, { now, earliest: now }));
    await assert.rejects(run(now, { scan: async () => value }));
  }
});

test('observations reject modified terms, wallet identities, arithmetic and authorization flags', async () => {
  const now = Date.now(), result = await run(now), check = result.paymentCheck;
  const options = { request: check.request, wallet, ...invoiceValidation(), now };
  for (const change of [{ walletId: merchant.id }, { buyerPrivateAddress: merchant.railgunAddress },
    { request: request(now, { amount: '2' }) }, { feesChecked: true }, { submissionEnabled: true },
    { status: 'ready' }, { coversRequestedAmount: false }, { shortfallUnits: '1' },
    { expiresAt: now }, { expiresAt: now + 60001 }, { balanceUnits: '0' }, { approved: true }]) {
    assert.throws(() => validatePrivatePaymentCheck({ ...check, ...change }, options));
  }
});

test('browser client matches the prior wallet, original request and fresh scan; edited responses fail', async () => {
  let alter = value => value, sent;
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture',
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      const result = await run(Date.now(), { paymentRequest: sent.paymentRequest });
      return new Response(JSON.stringify(alter(response(result))), { headers: { 'content-type': 'application/json' } });
    } });
  const original = request(Date.now());
  assert.equal((await client.checkPayment(original, 'local-fixture-password', wallet)).paymentCheck.request.id, original.id);
  assert.deepEqual(Object.keys(sent).sort(), ['action', 'password', 'paymentRequest']);
  const changes = [value => ({ ...value, privateWallet: { ...wallet, id: merchant.id } }),
    value => ({ ...value, paymentCheck: { ...value.paymentCheck, submissionEnabled: true } }),
    value => ({ ...value, paymentCheck: { ...value.paymentCheck, request: request(Date.now(), { amount: '2' }) } }),
    value => ({ ...value, spendableBalance: { ...value.spendableBalance, amountUnits: '2000000' } }),
    value => ({ ...value, synchronization: { ...value.synchronization, checkedAt: new Date(Date.now() - 60001).toISOString() } }),
    value => ({ ...value, networkLoaded: true }), value => ({ ...value, paymentReady: true })];
  for (const change of changes) { alter = change; await assert.rejects(client.checkPayment(original, 'local-fixture-password', wallet), /could not be checked/); }
});

test('client snapshots request and wallet before token lookup and drops results after an account change', async () => {
  let current = true, finishToken, sent;
  const input = { ...request(Date.now()) }, expectedWallet = { ...wallet };
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', isCurrent: () => current,
    getAccessToken: () => new Promise(resolve => { finishToken = resolve; }),
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return new Response(JSON.stringify(response(await run(Date.now(), { paymentRequest: sent.paymentRequest }))), { headers: { 'content-type': 'application/json' } });
    } });
  const pending = client.checkPayment(input, 'local-fixture-password', expectedWallet);
  input.amountUnits = '9000000'; expectedWallet.id = merchant.id; finishToken('fixture');
  assert.equal((await pending).paymentCheck.request.amountUnits, '1250000');
  const stale = client.checkPayment(request(Date.now()), 'local-fixture-password', wallet);
  current = false; finishToken('fixture'); await assert.rejects(stale, /account changed/);
});
