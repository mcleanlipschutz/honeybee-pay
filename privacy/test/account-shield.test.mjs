import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import memdown from 'memdown';
import { HDNodeWallet, keccak256, toUtf8Bytes } from 'ethers';
import { RailgunEngine, ShieldNote } from '@railgun-community/engine';
import { ArtifactStore, startRailgunEngine, stopRailgunEngine, createRailgunWallet, walletForID } from '@railgun-community/wallet';
// Test-only SDK internal: exercise the same receiver-side key agreement as a scan.
import { getSharedSymmetricKey } from '../node_modules/@railgun-community/engine/dist/utils/keys-utils.js';
import { prepareShieldReview, shieldInput, tokenInterface } from '../src/account-shield.mjs';
import { walletInterface } from '../src/deployment-check.mjs';
import { validateShieldReview, shieldProxy, shieldToken, shieldAmountUnits } from '../../checkout/src/shield-review.mjs';
import { createAccountWalletClient } from '../../checkout/src/account-client.mjs';

const from = '0x1111111111111111111111111111111111111111';
const block = { number: '0x1234', hash: '0x' + 'aa'.repeat(32) };
const prepared = { rpcURL: 'http://127.0.0.1:9999', deployment: {
  status: 'reviewed-deployment-and-circuit-matched', chainID: 11155111, proxy: shieldProxy,
  proxyPaused: false, verificationKeyMatches: true, blockNumber: block.number, blockHash: block.hash,
} };
function fixture({ balance = 20_000_000n, allowance = 0n, feeBps = 25n, decimals = 6n,
  badFee = false, reorg = false, onCall = () => {} } = {}) {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params }); onCall();
    if (method === 'eth_getBlockByNumber') return reorg ? { ...block, hash: '0x' + 'bb'.repeat(32) } : block;
    assert.equal(method, 'eth_call'); assert.equal(params[1], block.number);
    const { to, data } = params[0];
    const abi = to === shieldToken ? tokenInterface : walletInterface;
    assert.ok(to === shieldToken || to === shieldProxy);
    const { name, args } = abi.parseTransaction({ data });
    let output;
    if (name === 'decimals') output = [decimals];
    else if (name === 'balanceOf') { assert.equal(args[0], from); output = [balance]; }
    else if (name === 'allowance') { assert.equal(args[0], from); assert.equal(args[1], shieldProxy); output = [allowance]; }
    else if (name === 'shieldFee') output = [feeBps];
    else if (name === 'getFee') {
      assert.equal(args[1], true); assert.equal(args[2], feeBps);
      const fee = args[0] * feeBps / 10000n;
      output = [args[0] - fee, badFee ? fee + 1n : fee];
    } else throw new Error('Unexpected contract method');
    return abi.encodeFunctionResult(name, output);
  };
  return { rpc, calls };
}
const forbiddenArtifacts = new ArtifactStore(async () => { throw new Error('No proof artifacts needed'); }, async () => { throw new Error(); }, async () => false);
const start = () => startRailgunEngine('honeybeepay', memdown(), false, forbiddenArtifacts, false, false);
const digest = review => { const { reviewId: _id, ...body } = review; return { ...body, reviewId: keccak256(toUtf8Bytes(JSON.stringify(body))) }; };

test('shield reviews use recoverable SDK ciphertext, exact approval and account-bound validation', { timeout: 30000 }, async t => {
  const mnemonic = HDNodeWallet.createRandom().mnemonic.phrase, key = randomBytes(32).toString('hex');
  await start();
  t.after(() => stopRailgunEngine());
  const wallet = await createRailgunWallet(key, mnemonic, undefined, 0);
  const merchant = await createRailgunWallet(key, HDNodeWallet.createRandom().mnemonic.phrase, undefined, 0);
  const now = Date.now(), expiresAt = now + 60000;
  const prepare = (extra = {}) => prepareShieldReview({ wallet, prepared, amount: '1', publicAddress: from,
    checkSession: () => {}, expiresAt, now: () => now, rpc: fixture().rpc, ...extra });
  const { shieldReview: review } = await prepare();
  const expected = { amount: '1', publicAddress: from, walletId: wallet.id, privateAddress: wallet.railgunAddress };
  await t.test('calldata decodes with the installed Engine ABI and independent viem frontend ABI', () => {
    const valid = validateShieldReview(JSON.parse(JSON.stringify(review)), expected, now);
    assert.equal(valid.feeUnits, '2500'); assert.equal(valid.receivedUnits, '997500');
    assert.equal(valid.submissionEnabled, false); assert.equal(valid.gasEstimate, null);
    assert.throws(() => { valid.transaction.to = from; }, TypeError);
    const [spender, amount] = tokenInterface.decodeFunctionData('approve', valid.approval.data);
    assert.equal(spender, shieldProxy); assert.equal(amount, 1_000_000n);
    assert.equal(JSON.stringify(review).includes(mnemonic), false);
    assert.equal(JSON.stringify(review).includes(key), false);
  });
  await t.test('fresh reviews randomize the note and never create an unnecessary or unlimited approval', async () => {
    const next = (await prepare()).shieldReview;
    assert.notEqual(next.reviewId, review.reviewId); assert.notEqual(next.transaction.data, review.transaction.data);
    const covered = (await prepare({ rpc: fixture({ allowance: 1_000_000n }).rpc })).shieldReview;
    assert.equal(covered.approvalRequired, false); assert.equal(covered.approval, null);
    validateShieldReview(covered, expected, now);
    const partial = (await prepare({ rpc: fixture({ allowance: 500_000n }).rpc })).shieldReview;
    assert.equal(tokenInterface.decodeFunctionData('approve', partial.approval.data)[1], 1_000_000n);
  });
  await t.test('tampered terms, chain, calldata, allowances and expired reviews fail even with a recomputed digest', () => {
    const mutate = change => { const altered = structuredClone(review); change(altered); return digest(altered); };
    for (const change of [
      r => { r.transaction.chainId = 1; }, r => { r.transaction.to = from; },
      r => { r.publicAddress = merchant.id; }, r => { r.walletId = merchant.id; },
      r => { r.privateAddress = merchant.railgunAddress; }, r => { r.amountUnits = '10000000'; },
      r => { r.feeUnits = '0'; r.receivedUnits = r.amountUnits; }, r => { r.submissionEnabled = true; },
      r => { r.transaction.value = '0x1'; }, r => { r.transaction.data += '00'; },
      r => { r.approval.data = tokenInterface.encodeFunctionData('approve', [shieldProxy, 2n ** 256n - 1n]); },
      r => { r.approval.data = tokenInterface.encodeFunctionData('approve', [from, 1_000_000n]); },
      r => { const [requests] = walletInterface.decodeFunctionData('shield', r.transaction.data);
        const request = requests[0].toObject(true); request.preimage.token.tokenAddress = from;
        r.transaction.data = walletInterface.encodeFunctionData('shield', [[request]]); },
      r => { const [requests] = walletInterface.decodeFunctionData('shield', r.transaction.data);
        r.transaction.data = walletInterface.encodeFunctionData('shield', [[requests[0], requests[0]]]); },
    ]) assert.throws(() => validateShieldReview(mutate(change), expected, now));
    assert.throws(() => validateShieldReview({ ...review, feeUnits: '1' }, expected, now));
    assert.throws(() => validateShieldReview(review, expected, review.expiresAt));
    assert.throws(() => validateShieldReview(review, { ...expected, publicAddress: shieldProxy }, now));
  });
  await t.test('wrong decimals, missing funds, inconsistent fees, expired sessions and reorgs produce no review', async () => {
    for (const change of [{ decimals: 18n }, { balance: 999999n }, { badFee: true }, { reorg: true }, { feeBps: 10000n }]) {
      await assert.rejects(prepare({ rpc: fixture(change).rpc }));
    }
    await assert.rejects(prepare({ expiresAt: now }));
    let current = true;
    await assert.rejects(prepare({ checkSession: () => { if (!current) throw new Error('expired'); },
      rpc: fixture({ onCall: () => { current = false; } }).rpc }), /expired/);
  });
  await t.test('the local browser client accepts the SDK review and discards partial or changed-account responses', async () => {
    const response = { account: { authenticated: true }, network: 'Ethereum_Sepolia', paymentReady: false,
      networkLoaded: false, spendableBalanceVerified: false, privateWallet: { status: 'locked', id: wallet.id, privateAddress: wallet.railgunAddress },
      identityVerification: { verified: false, status: 'deferred-for-testnet' }, shieldReview: review };
    let next = response, current = true, changeDuringFetch = false, calls = 0;
    const client = createAccountWalletClient({ origin: 'http://127.0.0.1:4173', getAccessToken: async () => 'fixture-token',
      isCurrent: () => current, fetchImpl: async (_url, options) => {
        calls++; assert.equal(JSON.parse(options.body).action, 'shield-review');
        if (changeDuringFetch) current = false;
        return new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } });
      } });
    const fields = { amount: '1', publicAddress: from, password: 'disposable-test-password' };
    assert.equal((await client.execute('shield-review', fields)).shieldReview.reviewId, review.reviewId);
    next = { ...response, shieldReview: undefined };
    await assert.rejects(client.execute('shield-review', fields), /not confirmed/);
    next = response; changeDuringFetch = true;
    await assert.rejects(client.execute('shield-review', fields), /account changed/);
    assert.equal(calls, 3, 'failures are never retried automatically');
  });
  await t.test('the recovered receiving wallet decrypts the deposit; another wallet cannot', async () => {
    const [requests] = walletInterface.decodeFunctionData('shield', review.transaction.data);
    const { ciphertext, preimage } = requests[0];
    const recoverRandom = async id => {
      const viewing = walletForID(id).getViewingKeyPair();
      const shared = await getSharedSymmetricKey(viewing.privateKey, Buffer.from(ciphertext.shieldKey.slice(2), 'hex'));
      return ShieldNote.decryptRandom([...ciphertext.encryptedBundle], shared);
    };
    await assert.rejects(recoverRandom(merchant.id));
    await stopRailgunEngine();
    await start();
    const recovered = await createRailgunWallet(randomBytes(32).toString('hex'), mnemonic, undefined, 0);
    assert.equal(recovered.id, wallet.id); assert.equal(recovered.railgunAddress, wallet.railgunAddress);
    const random = await recoverRandom(recovered.id);
    const { masterPublicKey } = RailgunEngine.decodeAddress(recovered.railgunAddress);
    assert.equal(ShieldNote.getNotePublicKey(masterPublicKey, random), BigInt(preimage.npk));
  });
});

test('shield input rejects non-decimal, excessive, zero and invalid-public-wallet requests', () => {
  for (const amount of ['0', '-1', '1e6', '1.0000001', '10.000001', '01', ' 1', '1'.repeat(100), 1]) {
    assert.throws(() => shieldInput(amount, from));
    assert.throws(() => shieldAmountUnits(amount));
  }
  for (const address of [null, '0x' + '0'.repeat(40), 'merchant.eth', '../other-account']) assert.throws(() => shieldInput('1', address));
  assert.equal(shieldInput('10.000000', from).units, 10_000_000n);
  assert.equal(shieldInput('0.000001', from).units, 1n);
  assert.equal(shieldAmountUnits('0.000001'), 1n);
});
