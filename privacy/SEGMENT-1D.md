# Segment 1D: artifact storage and prover foundation

This increment registers the real snarkjs 0.7.5 Groth16 implementation with the
installed RAILGUN engine and adds a persistent, SHA-256-pinned artifact store.
The pre-existing local snarkjs package and lockfile edits were retained.

Run `npm ci --ignore-scripts`, `npm test`, and `npm run engine:smoke` from
`privacy/` with Node 22 or later. The smoke check uses disposable, unfunded
wallets in memory and runs without loading a network. Prover registration does
not mean a proof has been generated or verified.

Clean installation and all 31 tests passed, followed by the real offline engine
check. npm audit reports 31 findings: 0 critical, 13 high, 14 moderate, 4 low.
The bfj/jsonpath/underscore chain is introduced with snarkjs; these findings
remain unresolved. Existing GraphQL peer-dependency warnings also remain.

`createPinnedArtifactStore(directory, manifest)` returns the SDK ArtifactStore.
The manifest maps exact SDK logical paths, such as
`artifacts-v2.1/01x02/wasm`, to reviewed lowercase SHA-256 digests of decompressed
artifact bytes. Get, exists, and store reject unlisted names; get and exists
also reject corrupted cached bytes. Files are named by digest and written
atomically. Use a dedicated application-owned directory; this does not defend
against another process that controls the application's filesystem or manifest.

No trusted production manifest is supplied yet. Do not create trusted pins by
hashing arbitrary downloads. Establish upstream artifact provenance and verify
the selected circuit set before wiring this store into a networked engine.
The offline smoke deliberately retains its no-artifact store.

Still outstanding: deployment identity verification, persistent encrypted
wallet database, trusted circuit files, network synchronization, actual proof
generation and verification, and a test-asset private transfer. None of this
increment establishes payment readiness or onchain firewall enforcement.

Reference: https://docs.railgun.org/developer-guide/wallet/getting-started
Implementation signatures were checked against installed wallet 10.9.0 and its
engine dependency, since documentation examples can target other releases.
