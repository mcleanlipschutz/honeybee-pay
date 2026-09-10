import test from 'node:test';
import assert from 'node:assert/strict';
import { RailgunEngine } from '@railgun-community/engine';
import { bech32m } from '@scure/base';
import { createAccountInvoice, invoiceInput, invoiceValidation, validatePrivateRecipient as validateServer } from '../src/account-invoice.mjs';
import { privateRequestBody, validatePrivateRequest } from '../../shared/private-request.mjs';
import { validatePaymentRequest, paymentRequestFile, readPaymentRequest, paymentRequestInvoice,
  validatePrivateRecipient as validateBrowser, createPaymentRequestReader } from '../../checkout/src/private-request.mjs';
import { createAccountWalletClient } from '../../checkout/src/account-client.mjs';
import { createPrivateTransferAdapter } from '../src/private-transfer.mjs';

const now = 1800000000;
const address = chain => RailgunEngine.encodeAddress({ masterPublicKey: 123n, viewingPublicKey: new Uint8Array(32).fill(2), chain });
const wallet = { id: 'private-fixture-id', railgunAddress: address() };
const request = (options = {}) => createAccountInvoice({ wallet, amount: '1.25', lifetimeSeconds: 3600, checkSession() {}, now, ...options }).paymentRequest;
function rehash(value) {
  const body = privateRequestBody(value);
  return { ...value, digest: invoiceValidation(now).hash(JSON.stringify(body)) };
}

test('request amounts and lifetimes have bounded exact six-decimal terms', () => {
  assert.equal(invoiceInput('0.000001', 900), '1');
  assert.equal(invoiceInput('10.000000', 86400), '10000000');
  for (const amount of ['0', '-1', '10.000001', '1e0', ' 1', '01', '.1', '1.', '0.0000001', 1, '1'.repeat(5000)]) {
    assert.throws(() => invoiceInput(amount, 3600));
  }
  for (const lifetime of [0, 1, '3600', 900000, Infinity]) assert.throws(() => invoiceInput('1', lifetime));
});

test('browser and SDK validate canonical all-chain and Sepolia addresses and reject wrong layouts', () => {
  for (const recipient of [address(), address({ type: 0, id: 11155111 })]) {
    assert.doesNotThrow(() => validateServer(recipient));
    assert.doesNotThrow(() => validateBrowser(recipient));
  }
  const bytes = bech32m.fromWords(bech32m.decode(address(), 127).words);
  const wrongVersion = bytes.slice(); wrongVersion[0] = 2;
  const invalid = [address({ type: 0, id: 1 }), address({ type: 1, id: 11155111 }),
    address({ type: 0, id: 84532 }), address().toUpperCase(), address().slice(0, -1),
    address().slice(0, -1) + (address().endsWith('q') ? 'p' : 'q'),
    bech32m.encode('0zk', bech32m.toWords(wrongVersion), 127),
    bech32m.encode('0zk', bech32m.toWords(bytes.slice(0, -1)), 127),
    bech32m.encode('abc', bech32m.toWords(bytes), 127)];
  for (const recipient of invalid) {
    assert.throws(() => validateServer(recipient));
    assert.throws(() => validateBrowser(recipient));
  }
});

test('request validation rejects wrong schema, tampering, future timestamps and expiry in either runtime', () => {
  const original = request();
  assert.deepEqual(validatePaymentRequest(original, now), original);
  assert.ok(Object.isFrozen(original));
  const changes = [{ amountUnits: '2' }, { recipient: address({ type: 0, id: 11155111 }) },
    { version: 2 }, { kind: 'receipt' }, { id: 'hb_bad' }, { network: 'Ethereum' }, { chainId: 1 },
    { token: '0x' + '11'.repeat(20) }, { decimals: 18 }, { amountUnits: '01' }, { amountUnits: 1 },
    { amountUnits: '0' }, { amountUnits: '10000001' }, { ownerId: 'merchant' }, { digest: '0x' + '00'.repeat(32) },
    { createdAt: now + 6, expiresAt: now + 3606 }, { createdAt: now * 1000, expiresAt: now * 1000 + 3600 },
    { expiresAt: now + 901 }, { createdAt: now - 3600, expiresAt: now }];
  for (const change of changes) {
    const value = { ...original, ...change };
    assert.throws(() => validatePaymentRequest(value, now));
    assert.throws(() => validatePrivateRequest(value, invoiceValidation(now)));
  }
  assert.throws(() => validatePaymentRequest(original, original.expiresAt));
  assert.throws(() => validatePaymentRequest({ ...original, digest: undefined }, now));
});

test('native files reject duplicates, alternate encodings, malformed or oversized data and omit private account fields', () => {
  const original = request(), text = paymentRequestFile(original, now);
  assert.deepEqual(readPaymentRequest(text, now), original);
  for (const value of ['', '{', JSON.stringify(original, null, 2), text.replace('{', '{"version":1,'),
    text.replace('"decimals":6', '"decimals":6.0'), text.replace('honeybee', '\\u0068oneybee'), ' '.repeat(4097) + text]) {
    assert.throws(() => readPaymentRequest(value, now));
  }
  assert.throws(() => readPaymentRequest(text, original.expiresAt));
  for (const forbidden of ['password', 'accessToken', 'ownerId', 'privateKey', 'email', 'publicAddress', wallet.id]) assert.equal(text.includes(forbidden), false);
});

test('a recomputed digest is not merchant identity; immutable reviewed terms reject replacement before proving', async () => {
  const original = request(), replacement = rehash({ ...original, amountUnits: '9000000', recipient: address({ type: 0, id: 11155111 }) });
  assert.deepEqual(validatePaymentRequest(replacement, now), replacement); // Deliberately unsigned format.
  const approved = paymentRequestInvoice(original, now), proposed = paymentRequestInvoice(replacement, now);
  assert.ok(Object.isFrozen(approved));
  assert.equal(typeof approved.amountUnits, 'bigint');
  assert.equal(approved.expiresAt, now + 3600);
  assert.throws(() => { approved.recipient = replacement.recipient; });
  let proofCalls = 0;
  const prepare = createPrivateTransferAdapter({ sdk: { generateTransferProof() { proofCalls++; } }, now: () => now });
  await assert.rejects(prepare({ approvedInvoice: approved, proposedInvoice: proposed }), /Payment changed/);
  assert.equal(proofCalls, 0);
});

test('request generation checks session twice and produces new random references for the recovered recipient', () => {
  let checks = 0;
  assert.throws(() => request({ checkSession() { if (++checks === 2) throw new Error('expired session'); } }), /expired session/);
  const first = request(), second = request();
  assert.notEqual(first.id, second.id);
  assert.equal(first.recipient, second.recipient);
  assert.throws(() => request({ wallet: {} }));
});

test('file reader drops late imports after account change, replacement or explicit clearing', async () => {
  const text = paymentRequestFile(request({ now: Math.floor(Date.now() / 1000) }));
  let current = true, finish;
  const reader = createPaymentRequestReader({ isCurrent: () => current });
  const slowFile = () => ({ size: text.length, text: () => new Promise(resolve => { finish = resolve; }) });
  let pending = reader.read(slowFile()); current = false; finish(text);
  await assert.rejects(pending, /account changed/);
  current = true; pending = reader.read(slowFile());
  const replacement = await reader.read({ size: text.length, text: async () => text }); finish(text);
  assert.equal(replacement.amountUnits, '1250000'); await assert.rejects(pending, /selection or account changed/);
  pending = reader.read(slowFile()); reader.clear(); finish(text); await assert.rejects(pending, /selection or account changed/);
  await assert.rejects(reader.read({ size: 4097, text() { throw new Error('must not read'); } }), /4 KB/);
});

test('account client binds request to returned wallet, amount and lifetime, rejecting late or misleading responses', async () => {
  const paymentRequest = request({ now: Math.floor(Date.now() / 1000) });
  const response = { account: { authenticated: true }, network: 'Ethereum_Sepolia',
    identityVerification: { verified: false, status: 'deferred-for-testnet' },
    privateWallet: { status: 'locked', id: wallet.id, privateAddress: wallet.railgunAddress },
    paymentReady: false, networkLoaded: false, spendableBalanceVerified: false, paymentRequest };
  let next = response, current = true, changeDuringFetch = false;
  const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture', isCurrent: () => current,
    fetchImpl: async () => { if (changeDuringFetch) current = false; return new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }); } });
  const fields = { password: 'test-only-password', amount: '1.25', lifetimeSeconds: 3600 };
  assert.deepEqual((await client.execute('invoice-create', fields)).paymentRequest, paymentRequest);
  for (const change of [{ paymentReady: true }, { networkLoaded: true }, { spendableBalanceVerified: true }, { paymentRequest: undefined },
    { privateWallet: { ...response.privateWallet, id: '' } }, { privateWallet: { ...response.privateWallet, privateAddress: address({ type: 0, id: 11155111 }) } }]) {
    next = { ...response, ...change }; await assert.rejects(client.execute('invoice-create', fields), /not confirmed/);
  }
  next = response;
  await assert.rejects(client.execute('invoice-create', { ...fields, amount: '2' }), /not confirmed/);
  await assert.rejects(client.execute('invoice-create', { ...fields, lifetimeSeconds: 900 }), /not confirmed/);
  changeDuringFetch = true; await assert.rejects(client.execute('invoice-create', fields), /account changed/);
});
