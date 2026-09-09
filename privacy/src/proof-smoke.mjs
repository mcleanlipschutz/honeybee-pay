import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import memdown from 'memdown';
import { groth16 } from 'snarkjs';
import { ArtifactStore, startRailgunEngine, stopRailgunEngine, getProver } from '@railgun-community/wallet';
import { TXIDVersion } from '@railgun-community/shared-models';
import { createPinnedArtifactStore } from './artifact-store.mjs';
import { artifactDirectory, artifactManifest, artifactPrefix, proofArtifacts } from './proof-artifacts.mjs';
import { createProofFixture } from './proof-fixture.mjs';

// Isolated process only: engine and snarkjs both maintain singleton state.
export async function checkProof() {
  const store = await createPinnedArtifactStore(fileURLToPath(artifactDirectory), artifactManifest);
  const snapshot = new Map();
  for (const artifact of proofArtifacts) {
    const data = await store.get(artifactPrefix + artifact.name);
    if (data === null) throw new Error('Run npm run artifacts:prepare first');
    snapshot.set(artifactPrefix + artifact.name, data);
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
  const vkey = JSON.parse(requireArtifact(artifactPrefix + 'vkey.json'));
  try {
    await startRailgunEngine('honeybeepay', memdown(), false, offlineStore, false, false);
    const prover = getProver();
    // Bound proving parallelism for development machines; same proof algorithm.
    prover.setSnarkJSGroth16({
      fullProve: (inputs, wasm, zkey, logger) =>
        groth16.fullProve(inputs, wasm, zkey, logger, undefined, { singleThread: true }),
      verify: groth16.verify,
    });
    const fixture = createProofFixture();
    const { proof, publicInputs } = await prover.proveRailgun(
      TXIDVersion.V2_PoseidonMerkle, fixture, () => {},
    );
    assert.equal(await prover.verifyRailgunProof(publicInputs, proof, { vkey }), true);
    const alteredOutput = { ...publicInputs,
      commitmentsOut: [publicInputs.commitmentsOut[0] + 1n, publicInputs.commitmentsOut[1]] };
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
    return { status: 'offline-joinsplit-proof-check-passed', proofGenerated: true,
      proofVerified: true, alteredOutputRejected: true, alteredApprovalRejected: true,
      alteredRecipientWitnessRejected: true, alteredValueWitnessRejected: true,
      syntheticInputs: true, networkLoaded: false, paymentSettled: false, paymentReady: false };
  } finally { await stopRailgunEngine(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const timeout = setTimeout(() => {
    console.error('Offline proof check timed out.'); process.exit(1);
  }, 120000);
  try { console.log(JSON.stringify(await checkProof())); clearTimeout(timeout); process.exit(0); }
  catch { console.error('Offline proof check failed. Verify artifacts and prover compatibility.'); clearTimeout(timeout); process.exit(1); }
}
