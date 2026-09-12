import { randomBytes } from 'node:crypto';
import circom from '@railgun-community/circomlibjs';

// Synthetic circuit inputs: no real wallet, chain, invoice, or spendable note.
// Fixed small field values make the demonstration reproducible in structure;
// a fresh disposable signing key prevents reusing the engine's proof cache.
export function createProofFixture() {
  const { poseidon, eddsa } = circom;
  const key = randomBytes(32);
  try {
    const publicKey = eddsa.prv2pub(key);
    const nullifyingKey = 123n;
    const randomIn = [456n];
    const valueIn = [10000000n];
    const tokenAddress = 789n;
    const masterPublicKey = poseidon([...publicKey, nullifyingKey]);
    const notePublicKey = poseidon([masterPublicKey, randomIn[0]]);
    const pathElements = [Array(16).fill(0n)];
    let merkleRoot = poseidon([notePublicKey, tokenAddress, valueIn[0]]);
    for (const sibling of pathElements[0]) merkleRoot = poseidon([merkleRoot, sibling]);
    const nullifiers = [poseidon([nullifyingKey, 0n])];
    const npkOut = [111n, 222n];
    const valueOut = [2000000n, 8000000n];
    const commitmentsOut = npkOut.map((npk, i) => poseidon([npk, tokenAddress, valueOut[i]]));
    const boundParamsHash = 333n;
    const signed = eddsa.signPoseidon(key,
      poseidon([merkleRoot, boundParamsHash, ...nullifiers, ...commitmentsOut]));
    return {
      publicInputs: { merkleRoot, boundParamsHash, nullifiers, commitmentsOut },
      privateInputs: { tokenAddress, publicKey, randomIn, valueIn, pathElements,
        leavesIndices: [0n], nullifyingKey, npkOut, valueOut },
      signature: [...signed.R8, signed.S],
    };
  } finally { key.fill(0); }
}
