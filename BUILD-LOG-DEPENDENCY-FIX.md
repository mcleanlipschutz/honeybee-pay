## September 9, 2026 — Dependency fix prepared for review

- Prepared a local packaging fork of @railgun-community/circomlibjs 0.0.8 that moves test-only web3 to devDependencies and preserves all upstream cryptographic source files.
- Pinned the local tarball with an npm override; included full source, provenance, SHA-256 records and GPL-3.0 license text.
- Removed the obsolete runtime dependency chain containing tar, swarm-js and request; removed the now-unneeded request/form-data override.
- Fresh lockfile installation passed with lifecycle scripts disabled. All 26 tests passed, including unchanged-source checks and two Poseidon reference vectors.
- Real offline engine smoke passed: two disposable wallets created, encrypted reload succeeded, wrong key rejected.
- npm audit: 28 findings (0 critical, 10 high, 14 moderate, 4 low), compared with 71 in Segment 1C. Remaining findings are unresolved.
- No proof, wallet funding or transaction broadcast. This does not establish payment readiness or production security.
- Local fork maintenance and licensing documented. Prepared by Codex for McLean's review; GitHub upload and merge have not occurred for this change.
