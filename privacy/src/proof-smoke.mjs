import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import memdown from 'memdown';
import { groth16 } from 'snarkjs';
import { ArtifactStore, startRailgunEngine, stopRailgunEngine, getProver } from '@railgun-community/wallet';
import { TXIDVersion } from '@railgun-community/shared-models';
import { createPinnedArtifactStore } from './artifact-store.mjs';
import { artifactDirectory, artifactManifest, artifactPrefix, proofArtifacts } from './proof-artifacts.mjs';
import { createProofFixture } from './proof-fixture.mjs';
import { createTransferArtifactStore, transferArtifacts } from './transfer-artifacts.mjs';

// Isolated process only: engine and snarkjs both maintain singleton state.
export async function checkProof(outputs = 2) {
  if (![2, 3].includes(outputs)) throw new Error('Unsupported proof circuit');
  const prefix = `artifacts-v2.1/01x0${outputs}/`;
  const store = outputs === 2 ? await createPinnedArtifactStore(fileURLToPath(artifactDirectory), artifactManifest) : await createTransferArtifactStore();
  const snapshot = new Map();
  for (const artifact of outputs === 2 ? proofArtifacts : transferArtifacts.filter(a => a.variant === '01x03')) {
    const data = await store.get(prefix + artifact.name);
    if (data === null) throw new Error('Run npm run artifacts:prepare first');
    snapshot.set(prefix + artifact.name, data);
  }
  // Never return "missing" to the SDK downloader: all bytes are verified and
  // resident before startup, and any unexpected request stops the check.
  const requireArtifact = name => {
    if (!snapshot.has(name)) throw new Error('Unprepared offline artifact');
    return snapshot.get(name);
  };
  const offlineStore = new ArtifactStore(async name => requireArtifact(name),
    async () => { throw new Error('Offline artifact writes disabled'); },
    async name => { requireArtifact(name); return true; });
  const vkey = JSON.parse(requireArtifact(prefix + 'vkey.json'));
  try {
    await startRailgunEngine('honeybeepay', memdown(), false, offlineStore, false, false);
    const prover = getProver();
    // Bound proving parallelism for development machines; same proof algorithm.
    prover.setSnarkJSGroth16({
      fullProve: (inputs, wasm, zkey, logger) =>
        groth16.fullProve(inputs, wasm, zkey, logger, undefined, { singleThread: true }),
      verify: groth16.verify,
    });
    const fixture = createProofFixture(outputs);
    const { proof, publicInputs } = await prover.proveRailgun(
      TXIDVersion.V2_PoseidonMerkle, fixture, () => {},
    );
    assert.equal(await prover.verifyRailgunProof(publicInputs, proof, { vkey }), true);
    const alteredOutput = { ...publicInputs,
      commitmentsOut: publicInputs.commitmentsOut.map((value, index) => index === 0 ? value + 1n : value) };
    assert.equal(await prover.verifyRailgunProof(alteredOutput, proof, { vkey }), false);
    const alteredApproval = { ...publicInputs, boundParamsHash: publicInputs.boundParamsHash + 1n };
    assert.equal(await prover.verifyRailgunProof(alteredApproval, proof, { vkey }), false);
    // Test invalid witnesses too: recipient and value cannot silently diverge
    // from the original signed output commitments.
    for (const field of ['npkOut', 'valueOut']) {
      const changed = structuredClone(fixture);
      changed.privateInputs[field][0] += 1n;
      await assert.rejects(prover.proveRailgun(TXIDVersion.V2_PoseidonMerkle, changed, () => {}));
    }
    return { status: 'offline-joinsplit-proof-check-passed', circuit: `01x0${outputs}`, proofGenerated: true,
      proofVerified: true, alteredOutputRejected: true, alteredApprovalRejected: true,
      alteredRecipientWitnessRejected: true, alteredValueWitnessRejected: true,
      syntheticInputs: true, networkLoaded: false, paymentSettled: false, paymentReady: false };
  } finally { await stopRailgunEngine(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const timeout = setTimeout(() => {
    console.error('Offline proof check timed out.'); process.exit(1);
  }, 120000);
  try { console.log(JSON.stringify(await checkProof(process.argv.includes('--three-outputs') ? 3 : 2))); clearTimeout(timeout); process.exit(0); }
  catch { console.error('Offline proof check failed. Verify artifacts and prover compatibility.'); clearTimeout(timeout); process.exit(1); }
}
