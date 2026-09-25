import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import memdown from 'memdown';
import { groth16 } from 'snarkjs';
import { ArtifactStore, startRailgunEngine, stopRailgunEngine, getProver } from '@railgun-community/wallet';
import { Prover, RelayAdaptHelper } from '@railgun-community/engine';
import { TXIDVersion } from '@railgun-community/shared-models';
import { createTransferArtifactStore } from './transfer-artifacts.mjs';
import { createProofFixture } from './proof-fixture.mjs';
import { bindingHash, paymentRelay, paymentProxy, decodePrivatePaymentBatch } from './payment-verification.mjs';
import { relayInterface, walletInterface } from './deployment-check.mjs';
import { feeWETH, testUSDC } from '../../shared/test-assets.mjs';
import { makeReadOnlyRpc } from './network-preflight.mjs';

// Isolated, synthetic notes. Generates real Groth16 proofs, but does not load
// wallets, register Merkle roots, prove POI, or submit a transaction.
const require = createRequire(import.meta.url);
const { hashBoundParamsV2 } = require(join(dirname(require.resolve('@railgun-community/engine')), 'transaction/bound-params.js'));
const word = n => '0x' + BigInt(n).toString(16).padStart(64, '0');
const zero = word(0n), addressZero = '0x' + '00'.repeat(20);
const timeout = setTimeout(() => { console.error('Bound proof check timed out'); process.exit(1); }, 180000);
try {
  const pinned = await createTransferArtifactStore(), snapshot = new Map();
  for (const name of ['wasm', 'zkey', 'vkey.json']) {
    const path = `artifacts-v2.1/01x02/${name}`, data = await pinned.get(path);
    if (!data) throw Error('Prepare pinned 01x02 artifacts first');
    snapshot.set(path, data);
  }
  const read = path => { if (!snapshot.has(path)) throw Error('Unexpected artifact'); return snapshot.get(path); };
  await startRailgunEngine('honeybeepay', memdown(), false,
    new ArtifactStore(async p => read(p), async () => { throw Error('Offline writes disabled'); }, async p => { read(p); return true; }), false, false);
  const prover = getProver();
  prover.setSnarkJSGroth16({ fullProve: (inputs, wasm, zkey, logger) => groth16.fullProve(inputs, wasm, zkey, logger, undefined, { singleThread: true }), verify: groth16.verify });
  const action = { random: '0x' + randomBytes(31).toString('hex'), requireSuccess: false, minGasLimit: 0n, calls: [] };
  const options = [feeWETH, testUSDC].map((asset, i) => ({ nullifyingKey: BigInt(123 + i), tokenAddress: BigInt(asset.token) }));
  const txs = options.map((opts, i) => ({
    proof: { a: { x: 1n, y: 2n }, b: { x: [1n, 2n], y: [1n, 2n] }, c: { x: 1n, y: 2n } },
    merkleRoot: zero, nullifiers: createProofFixture(2, opts).publicInputs.nullifiers.map(word), commitments: [zero, zero],
    boundParams: { treeNumber: i, minGasPrice: 1n, unshield: 0, chainID: 11155111,
      adaptContract: paymentRelay, adaptParams: zero,
      commitmentCiphertext: Array.from({ length: 2 }, () => ({ ciphertext: [zero, zero, zero, zero],
        blindedSenderViewingKey: zero, blindedReceiverViewingKey: zero, annotationData: '0x', memo: '0x' })) },
    unshieldPreimage: { npk: zero, token: { tokenType: 0, tokenAddress: addressZero, tokenSubID: 0 }, value: 0 },
  }));
  const binding = bindingHash(txs, action);
  assert.equal(binding, RelayAdaptHelper.getRelayAdaptParams(txs, action.random.slice(2), false, [], 0n));
  const vkey = JSON.parse(read('artifacts-v2.1/01x02/vkey.json'));
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i]; tx.boundParams.adaptParams = binding;
    const fixture = createProofFixture(2, { ...options[i], boundParamsHash: hashBoundParamsV2(tx.boundParams) });
    const { proof, publicInputs } = await prover.proveRailgun(TXIDVersion.V2_PoseidonMerkle, fixture, () => {});
    assert.equal(await prover.verifyRailgunProof(publicInputs, proof, { vkey }), true);
    tx.proof = Prover.formatProof(proof); tx.merkleRoot = word(publicInputs.merkleRoot);
    tx.commitments = publicInputs.commitmentsOut.map(word);
    const oldPolicyBinding = bindingHash(txs, { ...action, requireSuccess: true });
    assert.notEqual(oldPolicyBinding, binding);
    assert.equal(await prover.verifyRailgunProof({ ...publicInputs,
      boundParamsHash: hashBoundParamsV2({ ...tx.boundParams, adaptParams: oldPolicyBinding }) }, proof, { vkey }), false);
    const removedBinding = bindingHash([tx], action);
    assert.notEqual(removedBinding, binding);
    assert.equal(await prover.verifyRailgunProof({ ...publicInputs,
      boundParamsHash: hashBoundParamsV2({ ...tx.boundParams, adaptParams: removedBinding }) }, proof, { vkey }), false);
    assert.equal(await prover.verifyRailgunProof({ ...publicInputs,
      boundParamsHash: hashBoundParamsV2({ ...tx.boundParams, adaptContract: addressZero }) }, proof, { vkey }), false);
  }
  const transaction = { to: paymentRelay, value: '0x0', data: relayInterface.encodeFunctionData('relay', [txs, action]) };
  assert.equal(decodePrivatePaymentBatch(transaction, txs.flatMap(tx => tx.nullifiers), 1n).length, 2);
  assert.notEqual(bindingHash([...txs].reverse(), action), binding);
  let liveVerifier = null;
  if (process.argv.includes('--live-verifier')) {
    const rpc = makeReadOnlyRpc('https://ethereum-sepolia-rpc.publicnode.com');
    assert.equal(BigInt(await rpc('eth_chainId', [])), 11155111n);
    const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
    const call = async (to, abi, method, args) => abi.decodeFunctionResult(method, await rpc('eth_call', [{
      to, from: '0x0000000000000000000000000000000000000001', data: abi.encodeFunctionData(method, args) }, block.number]))[0];
    assert.equal(await call(paymentRelay, relayInterface, 'getAdaptParams', [txs, action]), binding);
    for (const tx of txs) {
      assert.equal(await call(paymentProxy, walletInterface, 'verify', [tx]), true);
      const edited = structuredClone(tx); edited.boundParams.adaptParams = bindingHash([tx], action);
      assert.equal(await call(paymentProxy, walletInterface, 'verify', [edited]), false);
    }
    assert.equal((await rpc('eth_getBlockByNumber', [block.number, false])).hash, block.hash);
    liveVerifier = { blockNumber: block.number, blockHash: block.hash, bothProofsAccepted: true, removedProofBindingRejected: true };
  }
  console.log(JSON.stringify({ status: 'bound-private-proof-check-passed', proofs: 2, circuit: '01x02', requireSuccess: false, changedRelayPolicyRejected: true,
    bothProofsVerified: true, changedRelayBindingRejected: true, removedProofBindingRejected: true,
    reorderedProofBindingChanged: true, liveVerifier, syntheticInputs: true, poiProved: false, paymentSettled: false, paymentReady: false }));
  await stopRailgunEngine(); clearTimeout(timeout); process.exit(0);
} catch (error) {
  console.error(error); await stopRailgunEngine().catch(() => {}); clearTimeout(timeout); process.exit(1);
}
