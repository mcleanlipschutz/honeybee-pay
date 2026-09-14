<!-- SPDX-License-Identifier: Apache-2.0 -->
# M1 validation — September 14, 2026

Validated on Linux, Node.js 24.19.0, Compact compiler 0.31.1 (language 0.23.0),
Compact runtime 0.16.0, with dependencies pinned in `package-lock.json`.

| Check | Result |
| --- | --- |
| Full Compact compile | Passed; `approve` and `consume` circuits, proving keys and verifying keys produced |
| Artifact verification | Seven expected nonempty artifacts verified and hashed |
| Generated-contract tests | 16 passed, 0 failed |
| Terminal demonstration | Passed all six scenarios |
| npm production dependency audit | 0 reported vulnerabilities for this package on this date |
| Actual Midnight transaction proof generation/verification | Not performed |
| Midnight network deployment/finalization | Not performed |
| Browser connection to this contract | Not implemented |
| Asset transfer or merchant settlement | Not performed |

The build and tests were rerun after adding artifact completeness and freshness
checks. Tests exercise compiler-generated code through the official runtime,
not a separately reimplemented approval algorithm. The public-ledger test checks
field exposure; it is not a proof of network anonymity or ZK soundness. The npm
audit is a registry-advisory check, not a security audit of the contract or SDK.

The compiler's updater could not resolve the GitHub API in this environment. The
standalone compiler was downloaded from its official versioned GitHub release
and verified as 0.31.1. The build used `HONEYBEE_COMPACTC` as documented in the
README. Docker was unavailable, so a local network/proof-service integration was
not attempted. M2 is the next gate for real proof and network evidence.

Machine-readable source and artifact hashes are in [validation.json](validation.json).
Those hashes document this run; a later source change requires a fresh compile,
test and evidence record. Generated keys are build artifacts, not wallet secrets,
but are excluded from Git and recreated by the build command.
