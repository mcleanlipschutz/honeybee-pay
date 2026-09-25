# Honeybee Pay — Segment 1B review

September 8, 2026. Prepared for McLean's review; not uploaded to GitHub.

## What changed
This segment replaces the optional, uninstalled SDK path with pinned real dependencies,
adds full SDK address decoding to the real adapter, and adds a read-only network preflight.
The original transfer adapter and its 16 unit tests are unchanged.

Read first: privacy/src/railgun-loader.mjs, privacy/src/network-preflight.mjs,
privacy/src/preflight.mjs, then privacy/test/runtime.test.mjs.
The archive includes the full privacy folder for convenience. It excludes node_modules.
Apply it over Segment 1A; keep the existing root REVIEW.md as historical review material.

## Verified results
- Installed wallet 10.9.0 and shared-models 8.0.1; engine resolved to 9.6.0.
- Generated a dependency lockfile and successfully ran a clean npm ci with install scripts disabled.
- Real wallet SDK imports and decodes a public upstream test address fixture.
- The real adapter rejects the fake 0zkTEST_ONLY address used in the original unit tests.
- 23 tests passed after the clean install: 16 existing tests and 7 new tests.
- Ran the preflight against a public Sepolia RPC endpoint. Chain ID 11155111 matched,
  and eth_getCode returned bytecode at both SDK-configured proxy and relay-adapter addresses.
- No wallet was created, no proof was generated, and no transaction was sent.

The network unit tests use simulated RPC responses to exercise failures. Only the
separate live Sepolia preflight used a real endpoint. Address-decoder tests call the real SDK.

## What the network result means
Sepolia is an environment candidate, not a demonstrated complete private-payment environment.
Bytecode presence does not authenticate deployed code or prove correct verifier keys,
working artifacts, state synchronization, broadcaster availability, proof-of-innocence
services, token support, or successful payment settlement. These remain gates.
The installed configuration also lists Amoy and Hardhat; they were not checked live.
Arc is absent from this pinned configuration. Do not assume an Arc integration works.

## Dependency audit — unresolved blocker for use with funds
npm audit reported 72 advisories: 16 low, 39 moderate, 14 high and 3 critical.
Critical package entries: form-data, request, tar. See DEPENDENCY-AUDIT.json for
individual advisory URLs, dependency paths and suggested fixes. The counts are npm's
package-level report, not a count of confirmed exploitable Honeybee Pay defects.
Exploitability has not been assessed. No claim of a security audit or safe production use.
Do not run npm audit fix --force blindly: changing this tree may break SDK compatibility.
The next dependency task is to identify supported upstream fixes and retest.

Install scripts were disabled for this development check. Successful imports do not
establish that all native/proving features work with scripts disabled.
The official getting-started page recommends older wallet/shared-model versions;
this package continues the 10.9.0 API inspected in Segment 1A and is not a claim that
it is the recommended production stack. Peer-dependency and deprecation warnings
occurred during installation.

## Run in Codespaces
From the privacy directory, with Node 22 or later:

```bash
npm ci --ignore-scripts
npm test
npm run preflight
```

Without network environment variables, preflight reports SDK import success and exits
with code 2 (network not checked). For the same read-only Sepolia check used here:

```bash
HONEYBEE_NETWORK=Ethereum_Sepolia HONEYBEE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com npm run preflight
```

Exit 0 means only the documented preflight checks passed. Exit 1 means network
validation failed. No result means paid or payment-ready. Endpoint availability can change.
The program sends only eth_chainId and eth_getCode. Provider error text and RPC URLs
are not printed because custom endpoints may contain credentials. No seed phrase,
private key, invoice, or payment amount is needed. Never paste secrets into this review.

The test-network restriction belongs to preflight, not to the transfer adapter.
The real adapter still requires authenticated invoices, reviewed fees, validated token
metadata and independent buyer authorization before any eventual broadcast integration.
SDK address validity does not prove that the address belongs to the intended merchant.

## Next implementation gate
Resolve dependency advisories and compatibility; verify the Sepolia deployment identity;
then initialize the encrypted engine database, artifacts, prover and wallet synchronization.
Only after those work should a test-asset shielding/transfer flow be demonstrated with
real proof verification, buyer debit, merchant credit and replay rejection.
Merchant receipt status must depend on verified settlement.

## Sources and attribution
- https://docs.railgun.org/developer-guide/wallet/getting-started
- https://docs.railgun.org/developer-guide/wallet/getting-started/2.-setting-up-networks-and-rpc-providers.md
- https://www.npmjs.com/package/@railgun-community/wallet/v/10.9.0
- https://www.npmjs.com/package/@railgun-community/shared-models/v/8.0.1
- Address fixture: wallet 10.9.0, dist/services/railgun/wallets/__tests__/wallets.test.js (upstream MIT).

AI-assisted code and tests prepared by Codex for McLean's review. New code follows
the repository MIT license; dependencies retain their own licenses.
