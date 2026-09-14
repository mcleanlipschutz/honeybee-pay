<!-- SPDX-License-Identifier: Apache-2.0 -->
# Real-proof infrastructure status

Checked September 14, 2026. This records a remaining engineering blocker, not a completed proof run.

- Full Compact compilation and both circuit key sets succeed locally.
- The official generated-runtime simulation and mobile-request adapter tests pass.
- The `zkir --help` command exposes compile/key-generation commands, not a transaction-proving CLI.
- No Docker, Podman, Skopeo or Cargo executable is available in this environment.
- The official Ledger 8.1.2 release lists WASM packages and test reports, without a standalone proof-server executable. The official local proof-server guide distributes a Docker image.
- No approved, functioning local proof endpoint or funded Midnight test wallet is connected. No user witness, secret, seed or payment password has been sent to a remote prover.

To unblock the next engineering segment, provide a developer machine with Docker and a test-only Midnight wallet. The agent should first resolve the exact compiler, ZKIR, ledger and proof-server compatibility against the target network; do not infer compatibility just from matching major numbers or blindly use `latest`. Bind the prover only to localhost. Then implement actual proof generation/verification, encrypted private-state recovery and disposable test deployment, and capture canonical transaction/contract evidence. These implementation tasks remain the agent's work.

Authoritative references inspected:

- [Run a proof server](https://docs.midnight.network/guides/run-proof-server)
- [Proof-server release routing](https://docs.midnight.network/relnotes/proof-server)
- [Official ledger releases](https://github.com/midnightntwrk/midnight-ledger/releases/tag/ledger-8.1.2)
- [Environment release overview](https://docs.midnight.network/relnotes/overview)

No real proof, network deployment, browser proof connection or private settlement is claimed.
