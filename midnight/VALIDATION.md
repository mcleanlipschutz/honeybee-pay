<!-- SPDX-License-Identifier: Apache-2.0 -->
# Pre-proof validation — September 18, 2026

Linux, Node.js 24.19.0, Compact compiler 0.31.1, runtime 0.16.0 and
official encrypted-state provider 4.1.1. Dependencies are lockfile-pinned.

| Check | Result |
| --- | --- |
| Full Compact v2 compile | Passed; both circuits, proving keys and verifying keys produced |
| Build gate | All seven nonempty artifact hashes, source freshness and runtime identity checked before generated code executes |
| Generated-contract tests | 16 passed, including changed expiry and replay rejection |
| Mobile-request adapter | 4 passed, including revalidation of expiry and exact terms |
| Artifact/local-prover boundary | 4 passed; missing/tampered files, wrong versions and remote endpoints rejected |
| Official encrypted-state storage | 1 integration test passed: disposable secret initialization, reopen, encrypted export/restore, wrong password, isolation and non-overwrite |
| Total Midnight tests | 25 passed, 0 failed |
| Terminal demonstration | All six scenarios passed |
| Production dependency audit | 0 reported vulnerabilities in midnight package on this date |
| Real proof-service preflight | Exited 2: no verified local prover; no witness data posted |
| Actual Midnight transaction proof / network finalization | Not performed |
| Browser proof connection / asset settlement | Not implemented / not performed |

The invoice now includes expiry under the v2 commitment domain. This is a schema
change requiring a fresh disposable contract for testing, not reuse of v1 state.
The circuit binds the expiry value but does not enforce a trusted chain clock.

Tests call generated Compact code through the official runtime. Storage testing
uses the actual pinned SDK and fresh synthetic secrets, not a user's wallet.
Neither those tests nor key generation demonstrate ZK soundness, anonymity or a
verified transaction proof. Registry audits do not replace independent review.

The standalone official compiler completed the full build through
`HONEYBEE_COMPACTC`. Docker/Podman are unavailable in this environment; the
loopback prover and actual transaction integration remain the next gates.

[validation.json](validation.json) records this run's source/artifact hashes.
Generated artifacts are excluded from Git and recreated by the compile command.
Any source change requires a fresh compile, tests and evidence record.
