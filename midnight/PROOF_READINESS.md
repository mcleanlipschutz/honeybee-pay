<!-- SPDX-License-Identifier: Apache-2.0 -->
# Real-proof readiness — September 18, 2026

Offline prerequisites improved; no actual Midnight transaction proof is verified yet.

## Completed here

- Full Compact 0.31.1 compilation with runtime 0.16.0; both circuits and four keys.
- Invoice v2 binds request expiry along with the exact approved terms. The adapter
  rejects expired/changed terms again at handoff; this is not an on-chain clock check.
- All seven artifact hashes and the installed runtime are checked before generated
  simulator code executes or the proof-infrastructure gate passes.
- Official encrypted-state provider 4.1.1 is pinned. Disposable-state tests cover
  reopening, backup/restore, wrong passwords, concurrent initialization,
  non-overwrite and account/network/contract isolation. No user keys were used.
- Loopback-only proof-server configuration and bounded, metadata-only readiness
  checks reject remote URLs, redirects, credentials, oversized responses and
  mismatched versions.
- The consolidated regression/build command never proves, signs or sends funds.

## Compatible test target

The official [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix),
checked September 18, lists Compact 0.31.1, runtime 0.16.0, Midnight.js 4.1.1 and
proof server 8.1.0 for Preview. Components used here are pinned. The image uses an
explicit 8.1.0 tag, not latest; an immutable image digest is not yet recorded.

On the developer's trusted computer, inside midnight:

```bash
docker compose -f proof-server.yml up -d
npm run proof:preflight
```

The published port is loopback-only. Startup may fetch public proving parameters.
See the [official local-proving guide](https://docs.midnight.network/guides/local-proving).
The check only reads health/version/readiness metadata and posts no witness data.
Infrastructure readiness is not proof verification.

## Remaining acceptance gates

1. Local infrastructure: this environment has no Docker/Podman executable and no
   verified local prover. The real preflight currently exits 2.
2. Real proof harness (engineering): connect official transaction/proof providers
   to the v2 artifacts using disposable secrets first. Capture genuine proof
   verification plus invalid-input rejection; mocks and simulation cannot pass.
3. Test deployment (owner + engineering): connect an isolated Preview test wallet,
   obtain free test resources, explicitly approve deployment and record finalized
   contract/transaction evidence. Pin authority, contract, network and artifacts.
   The changed v2 contract requires a fresh disposable deployment, not silent reuse
   of a v1 contract or its state.
4. Integrated recovery (engineering): connect the tested encrypted storage to real
   failed/interrupted proof transactions and fresh-process recovery. The storage
   adapter alone is not end-to-end proof recovery.
5. Payment integration: independently reconcile the older public and private
   pending attempts; preserve explicit payment consent and matching settlement
   evidence. Midnight approval cannot make a public USDC transfer private.

Keep all seeds and backup passwords on your device. No witness was sent remotely,
contract deployed, or payment signed during these checks.
