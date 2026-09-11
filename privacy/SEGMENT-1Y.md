# Segment 1Y: bounded dependency security update

Implemented September 11, 2026. Fresh production-dependency audits now report
**zero high and zero critical findings in both components**. This is dependency
maintenance, not a completed security audit or permission to enable payments.
The private signing gate remains closed and the hosted site is unchanged.

## Pins and compatibility boundaries

| Component | Package | Before | Reviewed pin |
| --- | --- | --- | --- |
| Private runtime | Axios | 1.7.2 | 1.18.0 |
| Private runtime | dset | 3.1.2 | 3.1.4 |
| Private runtime | js-yaml 4 | 4.1.0 | 4.3.2 |
| Private runtime | vulnerable bn.js 4 copies | 4.11.6 | 4.12.5 |
| Both | ws 8 | Multiple 8.x copies | 8.21.3 |

Overrides are version-scoped for bn.js, js-yaml and ws, preserving the existing
bn.js 5, js-yaml 3 and ws 7 APIs. Lockfiles include the small Axios transport
dependency changes. No force-fix, SDK downgrade or cryptographic-source edit was
used. RAILGUN wallet 10.9.0, engine 9.6.0, shared-models 8.0.1, snarkjs 0.7.5,
the vendored circomlibjs source and Privy/viem direct versions are unchanged.

Axios is on the configured POI request path; tests verify that the wallet and
the application interceptor share its patched instance and retain the scoped
fetch adapter. GraphQL Mesh brings in dset/js-yaml and WebSocket executors;
the installed SDK's actual history-query adapter still passes with a controlled
response. Existing application scans use HTTP transports. Merely locating a
package does not establish exploitability, and unused SDK branches have not been
proven unreachable. bn.js unit conversions and the zero-bit-mask regression are
checked without changing the proving implementation.

Maintainer references: [Axios request-construction fix](https://github.com/axios/axios/security/advisories/GHSA-mmx7-hfxf-jppx),
[dset implicit-key fix](https://github.com/lukeed/dset/commit/16d6154e085bef01e99f01330e5a421a7f098afa),
[js-yaml merge-budget fix](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh),
[bn.js state fix](https://github.com/indutny/bn.js/commit/33df26b5771e824f303a79ec6407409376baa64b),
and [ws memory-exhaustion fix](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p).

## Fresh audit results and remaining risks

Both runs used `npm audit --omit=dev --json --ignore-scripts`. Values count
affected packages, including inherited findings, not independent vulnerabilities
or demonstrated application exploits. Both post-update audits still exit 1
because unresolved findings remain. Development-only dependencies are excluded.

| Component | Before: critical / high / moderate / low | After: critical / high / moderate / low |
| --- | --- | --- |
| Private runtime | 0 / 10 / 14 / 4 (28 total) | 0 / 0 / 0 / 5 (5 total) |
| Checkout | 0 / 1 / 24 / 0 (25 total) | 0 / 0 / 23 / 0 (23 total) |

- Private runtime: one unresolved elliptic advisory propagates through
  crypto-browserify to five package entries. Its low npm severity is **not a
  safety approval for key handling**. The [upstream signature/key-exposure
  issue](https://github.com/indutny/elliptic/issues/321) needs call-path analysis
  and a reviewed upstream replacement/fix before a real-money release. No
  speculative cryptographic replacement was made here.
- Checkout: uuid and decode-uri-component advisories propagate through the
  wallet connector stack to 23 entries. The [uuid advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq)
  concerns v3/v5/v6 output-buffer calls, not v4. One inspected MetaMask utility
  uses v4, but this is not a complete connector reachability proof. Moving its
  uuid 8/9 dependencies across major versions needs integration review.
  [decode-uri-component's advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
  remains recorded from npm; its advisory page was unavailable during this
  review. No replacement across its 0.x compatibility lines was guessed.
- Existing GraphQL Mesh peer-version mismatches remain. They predate this
  segment; a passing offline query does not validate every GraphQL mode.
  Existing large-browser-chunk and Worker `node:worker_threads` externalization
  warnings also remain. These are not hidden by the audit improvement.

## Validation

From `privacy/`:

```sh
npm test
npm run engine:smoke
npm run proof:smoke
npm ci --dry-run --ignore-scripts --no-audit --no-fund
npm audit --omit=dev --json --ignore-scripts
```

From `checkout/`:

```sh
npm test
npm run build
npm ci --dry-run --ignore-scripts --no-audit --no-fund
npm audit --omit=dev --json --ignore-scripts
```

Node 24.19.0 / npm 11.9.0: **127 private-runtime tests and 38 checkout tests
passed**, plus both offline smoke checks and the client/Worker build. The dset
test was then strengthened for implicit array keys and both setter variants;
all four focused dependency tests passed again. Lockfile dry-runs passed; these
are not clean-install or cross-platform runtime tests.

The real SDK created two disposable, unfunded wallets, rejected a wrong key,
and reloaded an encrypted wallet. A new proof using pinned artifacts and synthetic
inputs verified; changed outputs/approval and invalid recipient/value witnesses
were rejected. The prover's two `ERROR: 4` lines are expected from those invalid
witness checks. Poseidon reference vectors and vendored source hashes passed.

See [machine-readable evidence](reports/segment-1y-validation.json). These are
the complete two JavaScript suites, not a fresh Solidity/full-repository run,
independent penetration test, actual browser test or live network test.
No keys were used to sign transactions, no broadcast occurred and no private
merchant payment settled. No main merge or deployment was performed.

## Next gate

Use the trusted computer for actual local sign-in, wallet/history recovery and
live/forked Sepolia sync/deposit validation before signing integration. A small
test deposit still needs explicit user approval and canonical/spendability
verification. Private merchant settlement and encrypted receipts remain unbuilt.
KYC stays deferred; the commercial 0.5%-1% fee idea remains tabled.
