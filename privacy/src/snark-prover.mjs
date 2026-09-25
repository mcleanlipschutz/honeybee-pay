import { groth16 } from 'snarkjs';

// Install before loading/scanning a wallet: RAILGUN can generate outgoing
// post-transaction POI proofs as part of a refresh. These proofs cannot spend
// notes or authorize a new transfer. Parallelism is bounded for laptops.
export function installSnarkProver(sdk) {
  sdk.getProver().setSnarkJSGroth16({
    fullProve: (input, wasm, zkey, logger) => groth16.fullProve(input, wasm, zkey, logger, undefined, { singleThread: true }),
    verify: groth16.verify,
  });
}
