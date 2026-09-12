# Segment 1E: first real local proof

Honeybee Pay can now generate and verify a RAILGUN V2 JoinSplit proof through the
installed wallet SDK and its Groth16 prover. This demonstration uses a synthetic
input note, two output notes, a synthetic Merkle tree and a fresh disposable
signing key. It does not use a funded wallet, deployed contract or real invoice.

## Run the check

Use Node 22 or later, then run from `privacy/`:

```sh
npm ci --ignore-scripts
npm test
npm run engine:smoke
npm run artifacts:prepare
npm run proof:smoke
```

Artifact preparation downloads three files from a pinned upstream Git commit.
Subsequent runs use the verified cache. The proof command reads all verified
files before starting the engine, rejects unexpected artifact requests, and
does not load a network or permit fallback downloads. It runs in an isolated
process with a two-minute timeout because the engine and prover maintain global
state. Proving uses a single thread to limit development-machine resource use.

The proof check verifies the valid proof, then confirms that:

- Changing an output commitment invalidates the proof.
- Changing the bound-parameters hash invalidates the proof.
- Changing a recipient note public key prevents proving the original signed outputs.
- Changing an output amount prevents proving the original signed outputs.

The two invalid-witness checks can print `ERROR: 4` from the upstream circuit
runtime. These are expected rejections. Success requires the final JSON status
`offline-joinsplit-proof-check-passed` and exit code zero; any failed assertion
returns a nonzero exit code. No private witness or signing key is printed or saved.

## Artifact provenance

The files come from the RAILGUN engine repository at commit
`6e2614d53a106dd62abad91e7ce03ee4a3956138`, under
[`src/test/test-artifacts-lite/1x2`](https://github.com/Railgun-Community/engine/tree/6e2614d53a106dd62abad91e7ce03ee4a3956138/src/test/test-artifacts-lite/1x2).
Each download must match its pinned Git blob hash, decompressed byte count and
SHA-256 digest. Pins are in `src/proof-artifacts.mjs`.

The decompressed WASM and proving key also match the `01x02` SHA-256 hashes
bundled in wallet SDK 10.9.0. The verification key is pinned separately because
the SDK does not supply a verification-key hash. Actual proof verification
confirms that the selected proving and verification artifacts work together.
This establishes artifact consistency, not an independent cryptographic audit,
trusted-setup ceremony verification or test-network deployment identity.

Artifact binaries are fetched into ignored local runtime storage and are not
added to this repository. RAILGUN's engine repository carries its own license;
this change does not redistribute or relicense upstream circuits or artifacts.
The synthetic fixture is created locally; upstream test vectors are not copied.

## Dependency fix and validation

The prover introduced `snarkjs -> bfj -> jsonpath -> underscore@1.13.6`.
A narrow override under `jsonpath` now uses `underscore@1.13.8`, the patch for
[GHSA-qpx9-hpmf-5gmw](https://github.com/jashkenas/underscore/security/advisories/GHSA-qpx9-hpmf-5gmw).
The cryptographic packages and local circomlibjs source remain unchanged.

- All 34 automated tests passed, including deep-array handling, JSON parser
  compatibility, artifact corruption rejection and matching the SDK's hashes.
- Offline wallet creation, encrypted reload and wrong-key rejection passed.
- Real proof generation, verification and four tampering checks passed.
- A fresh artifact download into an empty temporary cache passed.
- npm audit returned 28 findings: 0 critical, 10 high, 14 moderate and 4 low.
  The three findings from the new Underscore chain are removed. Other findings
  and the existing GraphQL peer-dependency warnings remain unresolved.
- A read-only Sepolia preflight confirmed chain ID 11155111 and bytecode at both
  SDK-configured protocol addresses. This is a presence check only.

Tests, wallet smoke and proof smoke were repeated successfully after a clean
lockfile install with lifecycle scripts disabled. The machine-readable result
is recorded in `reports/segment-1e-validation.json`.

## What this does not establish

The proof's public Merkle root is synthetic. No onchain contract has accepted it,
and no token has moved. The bound-parameters hash is also a synthetic field
value; it is not yet a complete encoding of Honeybee's buyer-approved invoice.
The existing application-level approval checks do not become an independently
enforced payment firewall merely because this circuit test passes.

Next: verify the test deployment's implementation and circuit verification key,
configure persistent encrypted wallet storage and network synchronization, then
prepare a test-asset transfer with receipt verification. Funds and signing
credentials should not be put in the repository. No merge or deployment was
performed in this segment.
