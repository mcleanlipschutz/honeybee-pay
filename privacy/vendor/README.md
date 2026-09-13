# Local circomlibjs packaging fix

Based on @railgun-community/circomlibjs 0.0.8 from npm (Railgun-Community/circomlibjs).
Changed September 9, 2026 for Honeybee Pay:
- Version 0.0.8-honeybee.1 identifies this local fork.
- Moved web3 from dependencies to devDependencies; it is used only by upstream tests.
- Added the GPL v3 license text as COPYING; the upstream manifest declares GPL-3.0.

All upstream source files, constants, tests and tools are unmodified. UPSTREAM-HASHES.json
records SHA-256 values from the installed 0.0.8 package before changes. Cryptographic
algorithms were not rewritten. The fork retains its GPL-3.0 license and upstream attribution;
it is not relicensed under Honeybee Pay's MIT license. Source is included alongside the tarball.

Rebuild from vendor/circomlibjs with npm pack --ignore-scripts --pack-destination .. .
The top-level direct dependency and npm override ensure engine uses this local package.
Upstream tests that use web3 are not run as part of the Honeybee Pay dependency installation.

This is a maintained local packaging fork, not an official upstream release. Re-evaluate it
when updating RAILGUN. Do not run npm install inside the vendor source for app use: that
would install its development dependencies, including the legacy test-only web3 tree.
