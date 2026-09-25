# Honeybee Pay — Segment 1C review

Prepared September 9, 2026 for McLean's review. GitHub has not been changed.

## Outcome
The real RAILGUN engine can start, create two distinct disposable private wallets,
unload and reload an encrypted wallet, reject the wrong encryption key, and stop.
These checks use the installed SDK, not simulated SDK responses.
No network provider is loaded. No funds, proofs or transactions are involved.

## Review these changes
- privacy/src/engine-smoke.mjs: isolated, offline engine/wallet check.
- privacy/package.json and package-lock.json: exact dependencies and targeted override.
- DEPENDENCY-AUDIT-1C.json: new npm audit report.
- DEPENDENCY-CHANGES-1C.json: package-version changes compared with 1B.
- BUILD-LOG-1C.md: proposed build-log entry to append after approval.

The package includes the complete privacy folder for easier application over Segment 1B.
Earlier review documents and audit are historical records. This document describes 1C.

## Dependency work
The critical form-data finding came through:
wallet -> engine -> circomlibjs -> web3 -> web3-bzz -> swarm-js -> eth-lib -> servify -> request -> form-data.
The request dependency allows form-data ~2.3.2. A targeted override moves that nested
package from 2.3.3 to 2.5.6. This remains within major version 2, but is outside request's
declared minor-version range, so it is a deliberate compatibility override, not an
upstream-approved fix. Multipart behavior in request has not been integration-tested.
The wallet smoke test and existing application tests pass with the override.

The new audit reports 71 package advisories: 16 low, 40 moderate, 14 high, 1 critical.
Previously: 72 total, including 3 critical. form-data no longer appears as vulnerable;
request remains flagged for other issues. Counts include inherited severities and do
not represent independently confirmed exploitable defects in Honeybee Pay.

The remaining critical tar 4.4.19 comes through:
wallet -> engine -> circomlibjs -> web3 -> web3-bzz -> swarm-js -> tar.
Moving tar to the patched major version would violate swarm-js's dependency range.
No such override or dependency deletion was applied. The SDK import's require cache
contained none of tar/request/servify/swarm-js. Source inspection found web3 used by
circomlibjs test files, while runtime source uses web3-utils. This is limited evidence
of reduced exposure for the current import path, not proof of unreachability throughout
the application. Proof downloads and network integration still need separate analysis.

The remaining audit findings are unresolved. This is not a production security signoff.
Next dependency work should evaluate an upstream release or a narrowly maintained fork
that removes unused legacy dependencies with full compatibility tests. Do not force
major dependency changes merely to make audit counts disappear.

## Engine test behavior
Wallet mnemonics and encryption material are generated fresh in the isolated process.
They are never printed or written to disk. memdown provides an in-memory database;
the SDK stores encrypted wallet data there. The artifact-store callbacks intentionally
reject artifact access. No prover is installed by this segment and no artifact is fetched.
Merkle scans must be enabled in the engine options for wallet creation to work, but no
network is loaded, so this smoke test does not synchronize chain history.

The correct-key reload proves only same-process encrypted storage/reload. It does not
prove durable backup, restart recovery, secure key custody, or private balance correctness.
JavaScript strings cannot be reliably zeroed; these are unfunded disposable test wallets
and the process exits after cleanup. Never send funds to test addresses.

## Run from privacy/
```bash
npm ci --ignore-scripts
npm test
npm run engine:smoke
```

Expected: 23 tests pass, followed by offline-engine-wallet-check-passed and
wrongKeyRejected: true. paymentReady and proofGenerated remain false.
Run engine:smoke separately from any real wallet process: the SDK uses a singleton engine.
Install scripts remain disabled; these results do not prove native proving support.

## Next functional work
Verify the Sepolia deployment identity, configure persistent encrypted storage and
artifact integrity checks, initialize the prover, and synchronize a test wallet.
Then demonstrate a real test-asset payment with proof verification and merchant credit.
The cash-like privacy goal and merchant checkout remain the project priorities.

## Sources and attribution
- https://github.com/advisories/GHSA-fjxv-7rqg-78g4
- https://github.com/advisories/GHSA-hmw2-7cc7-3qxx
- https://github.com/advisories/GHSA-23hp-3jrh-7fpw
- https://docs.railgun.org/developer-guide/wallet/getting-started/3.-set-up-database
- Installed wallet 10.9.0 init and wallet type declarations; circomlibjs 0.0.8 source.

AI-assisted code, investigation and tests prepared by Codex for McLean's review.
New project code follows the repository MIT license; dependencies retain their licenses.
