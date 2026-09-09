# Honeybee Pay dependency fix — review package

Prepared September 9, 2026. This is a proposed update to Segment 1C; it has not been uploaded to GitHub or merged.

## What changed
The obsolete runtime chain leading to tar has been removed by a small local packaging fork of @railgun-community/circomlibjs 0.0.8. The full web3 package is used by its upstream tests, while its runtime code uses web3-utils. The fork moves web3 to devDependencies, retains web3-utils at runtime, and changes the version to 0.0.8-honeybee.1. No cryptographic source was changed.

The application pins a local tarball and overrides the engine's circomlibjs dependency to that same package. The earlier request/form-data override is removed because that chain is now absent. This avoids forcing a new major tar version into an older consumer.

## Files to review
- privacy/package.json and privacy/package-lock.json: dependency resolution.
- privacy/vendor/README.md: provenance, license and rebuild instructions.
- privacy/vendor/circomlibjs/: complete fork source and GPL-3.0 COPYING.
- privacy/vendor/UPSTREAM-HASHES.json: hashes of 37 original non-manifest files.
- privacy/vendor/railgun-community-circomlibjs-0.0.8-honeybee.1.tgz: exact installable package. Keep this file when uploading.
- privacy/test/dependency-fix.test.mjs: unchanged-source, Poseidon-vector and dependency-resolution checks.
- BUILD-LOG-DEPENDENCY-FIX.md: proposed build-log entry.

Earlier Segment 1B/1C reports in this ZIP are historical. This document describes the current fix. The privacy folder is complete for application over Segment 1C; it does not replace the entire repository.

## Validation
A fresh npm ci --ignore-scripts --no-audit --no-fund completed successfully from the lockfile. All 26 tests passed. The offline engine created two disposable wallets, reloaded encrypted data with the correct key and rejected the wrong key. Every hashed upstream non-manifest file matches the installed fork. Two known Poseidon vectors pass. The lockfile excludes tar, swarm-js, web3, web3-bzz, request and servify, and the engine resolves the same fork as the application.

Run these in the privacy directory:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run engine:smoke
```

## Limits and maintenance
This is a local fork, not an upstream release. Keep its full source, attribution and GPL-3.0 license; it is not covered by the project's MIT license. Reevaluate the packaging change whenever updating RAILGUN. Do not install the vendor's development dependencies for application use: they include the old web3 test chain.

An npm audit report does not fully assess locally vendored code; unchanged-source checks and test vectors provide specific compatibility evidence, not a cryptographic audit. Full proving, artifact download, network synchronization and a real test-asset payment remain untested by this fix. No funds were used, no proofs generated, and no transaction broadcast. paymentReady remains false.

AI-assisted implementation and verification prepared by Codex for review.

## Audit result
Current npm audit: 28 package findings — 0 critical, 10 high, 14 moderate, 4 low.
Segment 1C reported 71 — 1 critical, 14 high, 40 moderate, 16 low.
The tar finding and its runtime dependency chain are absent. Remaining findings are unresolved. Counts include inherited package severities and are not counts of independently confirmed application exploits. Audit exits with status 1 because findings remain.
See DEPENDENCY-AUDIT-FIX.json, INSTALL-FIX.txt, TEST-FIX.txt and ENGINE-FIX.txt for evidence.
