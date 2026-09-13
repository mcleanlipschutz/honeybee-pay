# BUILD LOG

Current checkpoint: **September 11, 2026, through Segment 1Z and Windows path repair**. See the
[project status](../README.md#current-status) and
[remaining test checklist](../TEST_CHECKLIST.md). Entries below are chronological:
each records what was true at that milestone. Later entries supersede earlier
limitations; for example, Segment 1V adds the history backup missing in 1U.

## September 7, 2026 - Repository and first-demo scope

09/07/2026

Goal : define honeybee pay what what the first demonstration will accomplish 

Work Completed : created repository, added README, license, amd .gitignore; documented the problem and three payment demo test

Decisions : use test USDC; compare normal, unprotected redirected , and firewall protected transactions 

Testing : no code or transactions performed yet 

Next Step: set up development environment

## September 8, 2026 - Development enviorment ready

- Installed Foundry and confirmed Forge 1.8.1 works.
- Created the contracts folder using Foundry's starter template.
- Ran the sample Counter tests: 2 passed, 0 failed.
- Added Foundry Cache and output folders to .gitignore.
- Committed and pushed the setup to Github.

Reused code: Foundry's Counter starter and forge-std testing library.
AI assitance: Setup guidance and troubleshooting.

Next: Implment buyer-approved paymentrules and tests.

## September 8, 2026 - Payment approval prototype and privacy Segment 1A

Goal: prioritize cash-like private payments, then build a merchant-friendly checkout. Payment-rule checks and AI assistance are supporting features.

Work completed:
- Committed the public payment approval prototype in `contracts/src/HoneybeePay.sol`. This records approvals; it does not execute private payments.
- Prepared and reviewed a RAILGUN transfer adapter, SDK loader, unit tests, and review guide.
- Added exact decimal amount handling, invoice matching, expiry checks, and a local lock against overlapping proof requests.
- Approved Segment 1A for a separate branch and opened [draft pull request #1](https://github.com/mcleanlipschutz/honeybee-pay/pull/1). The main branch has not been changed by this work.

Testing:
- During Segment 1A preparation, 16 Node unit tests passed and 0 failed.
- Tests use simulated SDK responses. They check application behavior, not cryptography or settlement.
- Checked SDK call signatures against the published wallet package version 10.9.0.
- Verified the uploaded files matched the reviewed ZIP.

Current limits:
- No real ZK proof has been generated and no private payment has settled.
- The adapter prepares transaction data but does not broadcast it or mark an invoice paid.
- Invoice checks are not cryptographic buyer authorization or an onchain firewall.
- The earlier two passing Foundry tests were starter Counter tests, not tests of HoneybeePay.sol.
- No deployment or real-fund transaction was performed as part of Segment 1A.

Next: confirm a supported test environment, install compatible SDK/prover dependencies, and demonstrate a real proof and test-asset transfer before building confirmed merchant receipts.

AI assistance: Codex prepared the adapter, tests, and review package. McLean reviewed and approved uploading Segment 1A. This build-log update was requested separately.

## September 8, 2026 - Segment 1B reviewed and added

- Installed the real RAILGUN wallet SDK 10.9.0 and shared-models 8.0.1 with a dependency lockfile.
- Added SDK private-address validation and a read-only test-network preflight.
- Verified a clean install with scripts disabled, then ran 23 tests: all passed.
- A live Sepolia check confirmed chain ID 11155111 and bytecode at both configured protocol addresses. Contract identity and a complete payment environment remain unverified.
- Dependency audit reported 72 advisories, including 3 critical. The report is included for review; exploitability and compatible fixes remain unresolved.
- No real ZK proof, wallet funding, deployment, or private payment occurred.
- McLean reviewed and approved Segment 1B for upload to the existing draft PR. Files match the reviewed package; main remains unchanged.

Next: resolve dependency compatibility and advisories, verify deployment identity, and initialize engine storage, prover and wallet synchronization before demonstrating a real test-asset payment.

AI assistance: Codex prepared the code, tests, dependency checks and review package.

## September 9, 2026 - Segment 1C reviewed and added

- Added a real offline RAILGUN engine check with disposable buyer and merchant wallets.
- Verified wallet creation, encrypted reload, wrong-key rejection and engine shutdown.
- Applied a targeted form-data 2.5.6 override; documented its compatibility limits.
- Audit now reports 71 advisories, including 1 critical, down from 72 including 3 critical.
- The remaining tar critical finding and other advisories are unresolved.
- Clean dependency installation and 23 existing tests passed; offline engine check passed.
- No funded wallet, proof generation, chain synchronization or payment settlement yet.

Next: verify deployment identity and configure persistent storage, artifacts and prover.
AI assistance: Codex prepared code, dependency analysis and tests for McLean's review.

McLean approved uploading Segment 1C to the existing draft pull request. No merge or deployment was performed.

## September 9, 2026 - Dependency fix reviewed and added

- McLean reviewed and approved the dependency fix for the existing draft PR.
- Added a local packaging fork of circomlibjs 0.0.8 that moves test-only web3 to development dependencies. Upstream cryptographic source files are unchanged; full source, hashes, attribution and GPL-3.0 license are included.
- Pinned the local package for the application and engine. Removed the obsolete runtime chain containing tar, swarm-js and request, and the now-unneeded request/form-data override.
- Fresh lockfile installation with scripts disabled passed. All 26 tests passed, including unchanged-source checks and two Poseidon reference vectors.
- Real offline engine check passed: two disposable wallets created, encrypted reload succeeded, wrong key rejected.
- Audit reports 28 findings: 0 critical, 10 high, 14 moderate and 4 low. Remaining findings are unresolved.
- No proof generation, funding, transaction broadcast, merge or deployment occurred. Payment readiness remains unverified.
- Local fork maintenance and license requirements are documented in privacy/vendor/README.md.

AI assistance: Codex prepared the fix, tests and review package, then uploaded the approved changes.

## September 9, 2026 - Segment 1D artifact and prover foundation

- Resumed from the completed dependency fix and retained the unfinished local snarkjs dependency addition.
- Registered snarkjs 0.7.5 Groth16 with the real offline engine.
- Added persistent artifact caching with reviewed SHA-256 pins, atomic writes, and rejection of missing trust entries or corrupted bytes.
- All 31 tests passed. Offline wallet creation, encrypted reload, wrong-key rejection and prover registration passed.
- Repeated validation after a clean lockfile install with lifecycle scripts disabled: passed. npm emitted existing GraphQL peer-dependency warnings.
- Current npm audit reports 31 findings (0 critical, 13 high, 14 moderate, 4 low). These remain unresolved; the prover addition brings in the bfj/jsonpath/underscore advisory chain. This increment is not ready for funded use.
- No circuit manifest has been trusted, no real proof generated, and no network loaded or payment broadcast.
- Deployment identity, persistent wallet storage, verified circuit acquisition and proof verification remain outstanding. See privacy/SEGMENT-1D.md.

AI assistance: Codex prepared this implementation and validation for McLean's review.

## September 9, 2026 - Segment 1E: first real local ZK proof

- Replaced the prover's vulnerable Underscore dependency with 1.13.8 through a narrow jsonpath override. No cryptographic source was changed.
- Downloaded and pinned the upstream 01x02 circuit artifacts. Both WASM and proving-key digests match the installed SDK's expected hashes; the verification key is pinned separately.
- Generated and verified a real JoinSplit proof through the wallet SDK with synthetic notes and a disposable signing key.
- Confirmed rejection of altered output commitments, bound parameters, recipient witness and amount witness.
- All 34 automated tests and the offline wallet check passed. A download into an empty artifact cache also passed.
- Clean lockfile installation with scripts disabled, all 34 tests, wallet checks and real proof checks passed again. Results are in privacy/reports/segment-1e-validation.json.
- npm audit: 28 findings, including 10 high and 0 critical. The three new prover-chain findings are resolved; remaining findings and GraphQL peer warnings are not.
- Sepolia read-only preflight passed chain ID and bytecode-presence checks. Contract identity remains unverified.
- Updated the README's outdated status and added privacy/SEGMENT-1E.md with reproduction commands and precise limits.
- No wallet funding, chain synchronization, settled payment, merge or deployment occurred. Persistent wallet storage and verified network integration remain next.

AI assistance: Codex implemented and checked this segment at McLean's direction. The circuit proof is real; its synthetic transaction does not establish onchain payment readiness or independent firewall enforcement.

## September 9, 2026 - Segment 1F: persistent storage and deployment identity

- Added a LevelDOWN-backed wallet database with private-directory requirements and native database locking.
- Created two disposable encrypted wallets, exited the creating process, and recovered both in a fresh process. Incorrect keys were rejected; seed phrases and encryption keys were not found as literal plaintext in the database files. The temporary database was removed.
- Matched the configured Sepolia proxy, implementation and relay runtime bytecodes to Sourcify records. Proxy and relay have exact matches; implementation has a match with compiler-metadata differences.
- Verified the proxy implementation slot, unpaused state, relay destination and every coordinate of the 01x02 circuit verification key at one finalized block.
- Added checks that reject changed code, implementation, pause state, relay destination, circuit key, chain or block hash. Fixed concurrent read-only RPC response ID handling.
- Explicitly pinned the existing engine version 9.6.0 as the ABI dependency. LevelDOWN 6.1.1 is retained for SDK compatibility; platform and deprecation limits are documented.
- See privacy/SEGMENT-1F.md and privacy/reports/segment-1f-validation.json for reproduction and results.
- Clean install with lifecycle scripts disabled passed all 46 tests, fresh-process wallet recovery and the existing real-proof checks. Audit remains 28 findings: 0 critical, 10 high, 14 moderate, 4 low.
- No wallet funding, network synchronization, broadcast, merge or deployment. Next is application wallet initialization, secure key recovery and network/POI synchronization for a test-asset payment.

AI assistance: Codex prepared this implementation, reviewed the source records and ran the checks at McLean's direction. Deployment matching is not an independent security audit or evidence of a settled payment.

## September 9, 2026 - Segment 1G: recoverable demo workspace

- Added create, unlock and encrypted-backup restore commands for buyer, merchant and attacker roles. These are distinct accounts under one demo owner.
- Passwords enter through a hidden terminal prompt or stdin. The encrypted backup recreates all three identities; existing workspaces cannot be overwritten.
- Added Sepolia synchronization with deployment and POI checks before SDK network loading, two required history completion events, a 90-second deadline and persisted diagnostic status.
- Fixed the SDK provider weight requirement and added a regression test using the installed SDK configuration validator.
- All 49 tests pass, including fresh-process recovery, wrong-password rejection, overwrite protection and backup restoration.
- Live deployment and POI checks passed. SDK provider loading failed before UTXO or TXID scans completed. The diagnostic retry was interrupted by environment network approval cancellation; the underlying loading error remains unresolved.
- No dependencies changed. Previous dependency audit findings remain unresolved; no new audit was run in this segment.
- See privacy/SEGMENT-1G.md and privacy/reports/segment-1g-validation.json. Next: diagnose SDK provider loading, complete history synchronization, then verify spendable test-asset balances.
- No funds moved, transactions broadcast, merge or deployment performed.

AI assistance: Codex implemented and checked this segment at McLean's direction. Encrypted workspace recovery passed; network synchronization and payment settlement have not.

## September 9, 2026 - Segment 1H: SDK RPC connection resolved

- Captured a timeout from the default SDK ethers RPC transport. Added a narrowly scoped Node fetch adapter for the configured RPC, covering both ESM and CommonJS ethers entry points.
- The adapter uses the runtime's configured proxy routing, preserves request bytes/headers, rejects redirects and enforces cancellation and request timeouts. Endpoint credentials are excluded from error reports.
- A live SDK RPC request returned Sepolia block 11669725. Deployment verification passed after one transient failed attempt.
- The final live run passed deployment, POI availability and SDK provider initialization. UTXO history completed; TXID reported Incomplete. The 90-second deadline exited with synchronization false.
- All 54 tests passed. No dependencies changed, funds moved, transactions broadcast, merge or deployment performed.
- See privacy/SEGMENT-1H.md and privacy/reports/segment-1h-validation.json. The connection blocker is resolved; TXID history completion is next.

AI assistance: Codex diagnosed and implemented this transport fix at McLean's direction. A connected provider and completed UTXO scan do not establish spendable balances or payment settlement.

## September 9, 2026 - Segment 1I: TXID history download fixed

- Identified a proxy-tunnel timeout in the SDK GraphQL history transport, separate from its RPC client.
- Added a version-guarded mesh transport adapter scoped to the existing Sepolia history service. Kept the SDK queries, cursor, pagination, formatting and validation intact.
- The installed SDK successfully downloaded 3,709 TXID records in an isolated live query. This does not establish a validated wallet TXID tree.
- Added bounded retries for transient read-only RPC failures after repeated deployment-preflight timeouts. Protocol errors and deployment mismatches still fail immediately.
- All 58 tests passed. No dependencies changed.
- Automatic approval review then rejected full synchronization because the external POI service may receive wallet-derived transaction/address data without explicit payload/destination authorization. No further sync attempt followed rejection.
- Full scan validation remains blocked pending user approval for disposable-wallet POI requests to https://ppoi.fdi.network. No funded wallets or transactions were used; temporary demo workspaces were removed.
- See privacy/SEGMENT-1I.md and privacy/reports/segment-1i-validation.json.

AI assistance: Codex diagnosed and implemented this segment at McLean's direction. History retrieval passed; full synchronization and spendable balances remain unverified.

## September 10, 2026 - Segment 1J: POI transport and approved sync attempt

- The user explicitly approved disposable-wallet POI requests to https://ppoi.fdi.network.
- Recovered the approved run result: deployment and provider checks passed, UTXO history completed, and TXID was Updated when the 90-second deadline expired.
- Added a bounded configurable sync deadline (30–600 seconds, default 90). Automatic approval review rejected the extended run, requiring separate authorization for potentially wallet-related queries to the public RPC endpoint. No further full sync followed rejection.
- The approved POI transport probe compared Axios adapters: HTTP failed with ERR_BAD_RESPONSE; fetch returned HTTP 200 and validated TXID index 3709.
- Added an exact-endpoint Axios interceptor using its supported fetch adapter, a 15-second timeout and redirect rejection. Other Axios destinations remain unchanged.
- All 60 tests passed. No dependencies changed, funded wallets used, funds moved or transactions broadcast. Temporary demo workspaces were removed.
- See privacy/SEGMENT-1J.md and privacy/reports/segment-1j-validation.json. Full synchronization remains unverified pending the remaining network authorization.

AI assistance: Codex implemented and validated this segment at McLean's direction. The prior POI approval remains applicable; the new approval block was generated by automatic review for the RPC destination.

## September 10, 2026 - Full Sepolia synchronization passed

- After the user's additional approval for RPC and history-service requests, ran full synchronization with three disposable, unfunded demo wallets and the approved POI service.
- Deployment identity and circuit checks passed at finalized block 0xb21828. SDK provider initialization succeeded.
- Both UTXO and TXID history scans completed. The run exited 0 at 2026-09-10T01:16:11.700Z with synchronized true and paymentReady false.
- The temporary workspace was removed. No funds moved, transactions broadcast, merge or deployment performed.
- Saved the result in privacy/reports/synchronization-validation.json and updated the README and Segment 1J documentation. The implementation is unchanged from the previously passing 60-test suite.
- Next: establish the payment-test workspace and verified test asset, fund with test tokens, and check spendable balances before preparing a merchant payment.

AI assistance: Codex ran and recorded the approved validation at McLean's direction. Successful history synchronization is not evidence of payment settlement or an independently enforced firewall.

## September 10, 2026 - Privy checkout integration

- Added a React checkout with Privy email authentication and embedded Ethereum buyer wallets, configured for Sepolia only.
- Implemented immutable payment review, an explicit recipient-change rejection test, balance/network checks, USDC transfer simulation, Privy confirmation and receipt verification after two confirmations.
- Pinned Circle's published Sepolia USDC address. Restricted test payments to at most 10 USDC. Submitted hashes remain available for receipt rechecks instead of automatically resending.
- Created a responsive cream-and-honey interface with explicit public-transfer labeling. The RAILGUN implementation remains in the privacy package; private checkout and key recovery through Privy are not claimed.
- Four payment tests and the production build passed. Browser verification was blocked when browser installation hit the environment's usage limit. A real Privy App ID and test funds remain necessary for live validation.
- Initial checkout audit: 27 findings (25 moderate, 2 high, 0 critical). Updated Axios via override to 1.18.0. The ws update and final audit remain blocked by the same environment limit. No dependency-audit pass is claimed.
- See checkout/README.md and checkout/reports/validation.json. The target sponsor integration is Privy's financial-flow track; no prize eligibility or completed live integration is claimed yet.
- No secrets added, funds moved, merge or deployment performed.

AI assistance: Codex implemented and checked this adjustment at McLean's direction. The frontend is built; browser validation, live Privy payment, RAILGUN bridging and independent policy enforcement remain outstanding.

## September 10, 2026 - In-app wallet and verified-profile product direction

- Recorded the user's clarification in PRODUCT_DIRECTION.md: create a profile and wallet inside Honeybee, complete provider-based identity verification, and use a shielded balance for merchant checkout.
- Distinguished account login, KYC and payment privacy; documented public funding/withdrawal boundaries and the information known to verification and application services.
- Defined independent buyer/merchant ownership, private-key recovery, authenticated verification states, invoice-bound authorization and merchant receipt requirements for the next integration.
- Preserved the existing in-app email/embedded-wallet configuration. No external-wallet-first change was made. KYC and private checkout remain unimplemented and are labeled accordingly.
- Documentation-only change; checked the diff and links to local files. No application code or dependencies changed, and no new runtime tests were needed.

AI assistance: Codex recorded this product and architecture decision at McLean's direction. No identity documents collected, funds moved, transactions broadcast, merge or deployment performed.

## September 10, 2026 - Segment 1K: account-bound private wallets

- Added a local account-wallet service that verifies signed Privy-format access tokens using a configured public key and selects ownership only from verified app/subject claims.
- Created independently random RAILGUN wallet roots per account, with one account loaded per short-lived child process. No shared buyer/merchant recovery root is used.
- Added AES-256-GCM encrypted backups with bounded scrypt parameters and account-bound authenticated data. Recovery preserves the private address and wallet ID; a different account cannot restore the backup through this service, even with its correct password.
- Rejected caller-supplied account selectors, forged/expired/wrong-app tokens, identity-token substitution, tampered backups, overwrite attempts and unsafe filesystem paths. Concurrent creation produces one wallet; expensive workers are bounded.
- Kept account, wallet and identity-verification states distinct. All results retain KYC not-configured and paymentReady false. No identity documents are collected, and there is no public HTTP or browser connection to the key-handling code.
- All 66 privacy tests passed, including six new focused tests and actual SDK recovery across fresh processes. Tests use disposable local signing keys, not a live Privy login.
- Added only jose 6.2.12, pinned in package and lockfile. Audit completed with 28 unresolved findings: 10 high, 14 moderate, 4 low; none attributed to jose. Existing SDK versions are unchanged.
- Documented host access to decrypted keys, account/password recovery requirements, token-revocation limits and crash behavior in privacy/SEGMENT-1K.md. Saved privacy/reports/segment-1k-validation.json.
- Next: implement and validate the browser key-handling and recovery path, connect live authentication, then integrate provider-based verification and test-only private checkout. Existing public test checkout remains public.
- No wallet networks loaded by this segment, funds moved, transactions broadcast, merge or deployment performed.

AI assistance: Codex implemented and tested this segment at McLean's direction. Local account isolation and encrypted recovery pass; this is not production custody, live KYC or a settled private payment.

## September 10, 2026 - Segment 1L: browser wallet setup and KYC deferral

- Recorded the user's decision to postpone KYC until testing is complete and review the time before final hackathon submission. It may wait until after the contest. KYC is unverified and no longer a testnet readiness blocker; payment readiness remains false.
- Added browser account/private-wallet setup, recovery-password entry, encrypted-backup download, saved-file verification and restoration under the same authenticated account. The public test checkout remains labeled public.
- Connected the browser client to a protected local API that binds only to 127.0.0.1. It checks exact Host/Origin, signed access tokens, JSON/request headers, request sizes and rate limits; it serves only the built checkout and approved assets.
- Added verify-backup without overwriting stored wallets and returned the initial encrypted recovery copy on wallet creation. Password fields reset on submission, account changes clear the view, and stale responses cannot update another account's state. Failed writes are not automatically retried.
- Tested the browser client's wire protocol against actual SDK wallet workers using disposable local token fixtures: create, backup, verify and fresh-runtime restore preserve the wallet. Cross-account recovery, hostile origins/hosts, forged tokens, selectors and secret-file requests are rejected.
- All 69 privacy tests and 7 checkout tests passed. The production build passed with the existing chunk-size warning. Browser/mobile interaction and live Privy login remain unverified; real public Privy configuration is still required.
- No dependency versions changed or new audit run. Prior findings remain unresolved. The local runtime handles decrypted keys and recovery passwords; it is not a production browser self-custody or remote-hosting implementation.
- Added TEST_CHECKLIST.md and privacy/SEGMENT-1L.md; recorded privacy/reports/segment-1l-validation.json. Next: live authentication and browser recovery checks, then account synchronization, test funding, shielding and a private merchant payment. KYC is deferred.
- No wallet networks loaded, funds moved, transactions broadcast, merge or deployment performed.

AI assistance: Codex implemented and verified this segment at McLean's direction. Automated local wallet integration passes; live browser onboarding and private settlement remain to be tested.

## September 10, 2026 - Segment 1M: phone access

- Configured the public Privy development App ID and validated the supplied P-256 public verification key. Local runtime configuration and checkout serving passed. Email enabled in the user's dashboard screenshot; live sign-in remains untested.
- Added hosted onboarding with email sign-in, embedded public-wallet address, copy action and sign-out. The wallet/payment form appears first on phones, with larger inputs and touch targets.
- Preserved local-only private-wallet creation, encrypted backup and restoration; the hosted UI explicitly identifies these remaining limitations. No remote account API, recovery passwords or private storage is deployed.
- Kept the existing public Sepolia test checkout. No funds moved or transactions broadcast by this work. KYC remains deferred.
- Seven checkout tests and the production build passed. Native phone interaction and live Privy login are still awaiting the user's test.
- Production dependency audit completed: 25 unresolved findings (24 moderate, 1 high). The high ws advisory concerns Node WebSocket processing; this deployment serves static browser assets. No clean-audit claim and no dependency changes.
- Registered an owner-private Sites deployment for mobile access; deployment completion is recorded by the hosting status, not by this source entry. The deployment source is a snapshot of checkout only. GitHub PR remains draft and unmerged.

AI assistance: Codex implemented phone access at McLean's request. Public wallet onboarding is prepared for a live test; private settlement and remote private-wallet recovery remain unfinished.

Segment 1M hosting outcome: the first attempt timed out creating the managed HTTPS certificate. One retry of saved version 1 succeeded at 2026-09-10T14:33:08Z. Owner-private live URL: https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site . Phone sign-in remains untested. See MOBILE_ACCESS_STATUS.md for reproducible deployment identifiers and the first phone test.

## September 10, 2026 - Segment 1N: returnable receipts

- User completed mobile email login, logout/login with the same buyer address, separate merchant onboarding, faucet funding and a public 1-USDC payment. The receipt screen showed Payment received. Independently verified Sepolia transaction 0x3247ad91ac4f8ee5b735dfeb53bad84e1d5e127be53840f62194034e6d00e9a5: successful pinned-USDC transfer, matching buyer/merchant and amount, with eight confirmations at initial verification. This was a user-signed transaction; Codex did not sign or broadcast it.
- Added a Receipts tab, All/Sent/Received filters, details, older-page loading, transaction-hash lookup and downloadable text copies. Both parties can reopen the same public transfer reference across sessions/devices using chain history.
- Verified successful execution, canonical block/hash, pinned token, matching event/wallet and two confirmations. Rejected immature, reverted, removed, mismatched and duplicate evidence. Requests are bounded, cancelled on view/account changes, and failures do not silently advance history.
- Clearly included public faucet/external transfers rather than claiming every token transfer is a Honeybee purchase. No invoice, goods-delivery, tax or ZK-private receipt claim is made.
- Eleven checkout tests and the production build passed. Live read-only history found the existing 1-USDC payment in both wallets (same reference, opposite directions). New receipt UI and file download remain to be manually checked on phone.
- Documented the future private-wallet reader, encrypted invoice/receipt storage, selective sharing and opt-in email design in RECEIPTS_DESIGN.md. No email sent; KYC deferred. No dependencies changed or new funds moved by this segment.


## Segment 1O — homepage test-payment counter

Added a shared test-payment aggregate above the wallet navigation. Preserved the
Privy checkout, receipts and current owner-private audience. Added authenticated
pre-payment registration, server receipt/finality verification and a D1 registry
with unique completed transaction hashes. Summary reads reconcile pending records,
including a bounded recovery scan when a browser closes before reporting its hash.
The only historical import is the previously reviewed first mobile payment and
is reverified before counting. No real payments, token funding or arbitrary wallet
history are presented as Honeybee usage. ZK-specific aggregation is still future
work; KYC remains deferred.

Validation: 16 tests passed; generated SQLite migration inspected and exercised;
client and Worker builds passed. Audit remains 25 production findings (24 moderate,
1 high) in pre-existing transitive dependencies. No transaction was broadcast by
the agent. Direct live RPC verification in this workspace was network-blocked;
new hosted API and phone validation are recorded as outstanding in TEST_CHECKLIST.


## Segment 1P — private account synchronization

Connected the authenticated local wallet flow to reviewed Sepolia deployment
checks, POI availability, both SDK history scans and the loaded account's
spendable-USDC snapshot. The runtime still handles keys locally, locks the wallet
after every operation and leaves private payments disabled. Added local browser
sync action, bounded deadlines and rejection of incomplete or wrong-account
results. Repaired the local server path after the counter's client/server build
split. No private runtime was published and no transaction was broadcast.

Validation: nine focused privacy tests and four checkout-client tests passed;
checkout build passed; built local page served HTTP 200 with sync enabled.
Real-wallet tests exercised authentication/recovery and a local wrong-chain RPC;
successful scan/balance behavior used controlled SDK fixtures. Live account sync,
shielding and private settlement remain unverified. No dependency versions changed.
See privacy/SEGMENT-1P.md and the remaining test checklist.

## Segment 1Q — test-USDC deposit review

Added an account-authenticated local deposit review that recovers only the
current account's private destination. The prepared single-note shield call
uses installed RAILGUN Engine primitives, pinned Sepolia/USDC/proxy parameters,
finalized-block fee and allowance reads, and a separate exact-amount approval
when needed. The browser independently decodes the call and rejects altered
terms, expired reviews and changed accounts. The local UI shows protocol fees
and expected private credit, with gas explicitly unestimated and submission
disabled. No local key-handling runtime was published or transaction broadcast.

Validation: 21 focused tests passed (8 new deposit/SDK/client checks, 9 account/API/
sync tests including added deposit isolation checks, 4 checkout-client regressions).
Fresh-database recovery decrypts the prepared note; another wallet cannot.
Success chain-state responses are controlled fixtures, not live Sepolia evidence.
Checkout client/Worker build passed; existing warnings and dependency findings
remain. No dependency versions or Solidity contracts changed.

Read the user-required ETHSkills guidance before implementation. Recorded the
local trust, public-deposit privacy, MIT source and incomplete exit-path tradeoffs
in privacy/SEGMENT-1Q.md. KYC stays deferred. Next: local-machine live/fork preflight,
gas and explicit wallet confirmation, canonical Shield verification and rescan.

AI assistance: Codex implemented and tested this segment at McLean's direction.

## Segment 1R — deposit simulation and network-fee preview

Connected the local deposit review to a fresh deployment/fee/token check, exact
transaction simulation and bounded EIP-1559 gas quote. The account service stores
one expiring review per owner; fee-check requests can name only that stored review
and cannot substitute calldata. The fee worker receives no recovery password and
does not open account wallet storage. Approval is simulated separately until a
fresh allowance read permits simulation of the original shield calldata.

The UI shows the estimated maximum fee and next wallet-confirmation step, with
short expiry and account-change rejection. Signing and submission stay disabled;
no private service was published or transaction broadcast. Live Sepolia/fork
validation remains blocked from this workspace and is a required next gate.

Validation: 48 focused tests passed, including 1,000 bounded gas-rounding samples,
cache owner/replacement/concurrency cases, token/fee/balance/simulation failures,
latest-head deployment checks, client account changes and a real worker rejecting
a local wrong-chain RPC. Successful chain responses are controlled fixtures.
Checkout client/Worker build passed; existing warnings and dependency findings
remain. No dependency versions changed. KYC stays deferred.

AI assistance: Codex implemented and tested this segment at McLean's direction.

## Segment 1S — deposit transaction handling

Implemented a submission controller with separate explicit approval/deposit calls,
exact nonce and gas/fee requests, persistent browser attempt records and read-only
transaction reconciliation. Unknown or pending outcomes block another attempt;
late hashes survive logout/expiry, and completed attempts retain duplicate guards.
The verifier matches the canonical transaction and exact Approval or Shield event,
including the original note/ciphertext and reviewed net credit/fee. Deposits require
finalization and do not count as merchant payments or establish spendability.

The controller is not connected to the UI and its default signing gate stays
closed. Live Sepolia/fork validation remains blocked in this workspace; no blocked
route was retried or bypassed. The browser adapter still requires actual Web Locks,
storage and Privy testing before integration. Persistence is per browser/origin,
not cross-device or an independent onchain authorization control.

Validation: 32 focused tests passed (12 lifecycle/journal/receipt, one independent
Engine event-ABI parity check, 15 existing review/preflight/SDK, four account-client).
The controlled tests cover concurrent attempts, rejections, timeouts, reloads,
nonce/account changes, storage failures, canonical event mismatches and reorgs.
Existing 1,000-sample gas arithmetic and real SDK recovery checks pass. Checkout
client/Worker build passed with existing warnings. No dependencies changed, no
transaction was signed/broadcast and no private runtime was published. KYC stays
deferred. See privacy/SEGMENT-1S.md for the explicit remaining live/browser gates.

AI assistance: Codex implemented and tested this segment at McLean's direction.

## Segment 1T — merchant request design; implementation interrupted

Prepared the account-bound merchant request design while live wallet testing
waits for the user's computer access. The proposed local flow creates a request
from the authenticated merchant's recovered private wallet and lets a buyer
review a compact request file with fixed amount, token, network, expiry and
reference. Its digest is an integrity check, not merchant authentication or
proof of payment. Signing, private receipts and payment counting remain disabled.

The coding workspace disconnected during the implementation patch and remained
unavailable on the follow-up check. No Segment 1T code or tests were completed or
pushed. This commit saves the design and resume checklist only. Segment 1S remains
the latest verified implementation. Inspect the local working tree for partial
changes before resuming. See privacy/SEGMENT-1T-PLAN.md.

AI assistance: Codex prepared this design at McLean's direction.

## Segment 1T — local merchant requests implemented after recovery

Restored the workspace, found no partial implementation, and reconciled the
saved design with the current GitHub tree. Added authenticated invoice-create
through the isolated account worker: derive the recovered account’s private
recipient, generate a random reference and second-based expiry, and return a
locked wallet. No caller-selected recipient, network, token or account path is
accepted and no RPC is required for request creation.

The local UI now creates/downloads merchant requests and opens buyer request
files for review. Shared strict validation bounds amount, expiry, schema and
file size; independent browser/Engine address checks enforce canonical Sepolia
or all-chain addresses. Late file/API responses are discarded after account
changes. The immutable adapter snapshot prevents changing reviewed terms.
The digest is explicitly unsigned and does not authenticate a merchant. Request
files expose amount/private recipient to their recipient and omit account data
and secrets. They are not encrypted receipts and do not count as payments.

Validation: 17 focused tests passed: eight request/format/adapter/client tests,
four account-client regressions, three real local HTTP tests (extended with
actual SDK request creation, recovery and cross-account checks), and two account
wallet regressions. The initial run exposed an incorrect Engine named import;
using its exported RailgunEngine static address API fixed it before the passing
run. Checkout client/Worker build passed with existing chunk-size and viem
worker_threads warnings. Declared already-locked @scure/base 1.2.6 directly;
no resolved versions changed and no fresh dependency audit was performed.

Actual browser request download/import and live private settlement are pending.
Private signing stays disabled; no user transaction was signed or broadcast,
no private runtime was published, and the hosted site is unchanged. KYC remains
deferred. See privacy/SEGMENT-1T.md and its validation report.

AI assistance: Codex implemented and tested this segment at McLean's direction.

## Segment 1U — encrypted local merchant request history

Request creation now saves the exact request into an encrypted per-account
history before returning success. The existing authenticated worker recovers the
wallet, derives a separate history key and holds its account lock across the
read/append operation. Added password-protected invoice-history with no caller
selectors, chain RPC or payment signing. The UI lists saved requests, reopens
exact terms, redownloads active requests and keeps expiry separate from payment
status. Displayed history clears on close, account changes and other operations.

Storage uses AES-256-GCM with a fresh salt/IV and HKDF-SHA256 scoped to the
recovered root and authenticated account. Private files are bounded and checked
for unsafe links, ownership and permissions. Replacement uses an exclusively
created temporary file, file sync, atomic rename and POSIX directory sync.
Corruption fails closed; duplicate identical records do not rewrite history;
conflicting IDs or the 128-record limit reject additions without dropping records.
A response lost after a save is recoverable by opening history before retrying.

Validation: 24 focused tests passed (nine new storage/history/client tests,
eight request regressions, three local HTTP tests and four account-client tests).
HTTP coverage uses real SDK wallets and reopens the same account history through
a new server with a new login session. Storage tests cover wrong accounts/keys,
corruption, unsafe files, interrupted replacement, late responses, historical
expiry and capacity. The nine history tests passed again after bounding file-read
allocation. Checkout client/Worker build passed with existing chunk-size and
viem worker_threads warnings. No dependency versions changed or fresh audit ran.

History is local to this installation and is not included in the wallet recovery
backup; encrypted history export/restore is not built. File size/timing remain
visible, and encryption does not detect rollback/deletion by the filesystem
owner. This is not a settlement ledger, merchant receipt or once-only payment
reconciliation. Actual browser, Windows and power-loss validation remain pending.
No transaction was signed or broadcast; no private runtime or new site version
was published. KYC remains deferred. See privacy/SEGMENT-1U.md and its report.

AI assistance: Codex implemented and tested this segment at McLean's direction.

## Segment 1V — encrypted history backup and restore

Added separate request-history export and restore using the authenticated account
worker and the existing root/account-bound encryption. Exports re-encrypt a
validated snapshot without modifying the source history. Restore authenticates
and decrypts the file with the recovered wallet, then merges missing records
under the account lock. Existing records are retained; duplicates do not rewrite
the file, and conflicts or capacity overflow reject the entire merge. Expired
requests remain historical and never become payment confirmations.

The local interface now prepares/downloads encrypted history backups and restores
them after wallet recovery. The form clears passwords immediately, prevents
concurrent submission during file reads and discards reads after account changes.
The client validates encrypted envelopes and matches restore results to the
uploaded backup digest. There is no automatic retry after uncertain results.

A dedicated authenticated restore route permits a bounded 266240-byte body;
ordinary wallet calls retain the existing 16 KiB limit. Both routes share the
same origin, token, header, no-store, rate and concurrency protections. The
shared native envelope parser limits files to 256 KiB and rejects duplicate keys,
unknown fields, alternate encodings and invalid cryptographic field lengths.

Validation: 33 focused tests passed: eight backup tests, nine history regressions,
eight request regressions, four HTTP tests and four client regressions. Actual
SDK/API coverage restores the wallet first, merges its encrypted request history,
keeps a newer destination request, and verifies a repeated restore adds nothing.
Additional tests cover changed ciphertext, wrong accounts/roots, conflicting IDs,
capacity, expired history, interrupted writes, late reads/responses and both
Content-Length and chunked upload bounds. Checkout client/Worker build passed
with existing chunk-size and viem worker_threads warnings. Dependencies unchanged.

Keep the wallet recovery file and separate history backup; the same Honeybee
account, recovered wallet and its recovery password are required. Actual browser,
cross-computer and Windows/power-loss validation remain pending. These request
records are not receipts or a settlement ledger. Private signing stays disabled,
no user transaction was signed or broadcast, and no hosted deployment changed.
KYC remains deferred. See privacy/SEGMENT-1V.md and its validation report.

AI assistance: Codex implemented and tested this segment at McLean's direction.

## September 10, 2026 - Consolidated project checkpoint through Segment 1V

Goal: update the repository to reflect completed implementation, recorded test
evidence and the remaining work without KYC.

Completed work and evidence:

- Public mobile email login, return to the same embedded wallet, separate buyer
  and merchant onboarding, test funding and one user-signed 1-USDC Sepolia
  payment were verified in Segment 1N. Its receipt reader found matching sent
  and received references. Receipt history/downloads and the Segment 1O shared
  test-payment counter are implemented; manual phone checks remain outstanding.
- Real local ZK proof generation, tamper checks, persistent wallet recovery,
  deployment identity checks and disposable-wallet history synchronization were
  completed earlier. Account-bound private wallets and the local browser/API
  setup/recovery flow are implemented and covered by actual SDK/API tests.
- Segments 1P-1S implement account synchronization, deposit review, simulation,
  bounded gas/fee checks, submission control, persistent attempt tracking and
  canonical deposit verification. Successful funding responses in these tests
  are controlled fixtures. Live account funding and spendability are unverified;
  the controller is not connected to the UI and private signing remains disabled.
- Segment 1T implements merchant request creation, file download/import and
  exact-term review. Segment 1U persists and reopens encrypted account history.
  Segment 1V adds separate encrypted history backup/restore: recover the same
  account wallet first, merge missing requests, preserve newer records, skip
  duplicates and reject conflicts. These records are not private payment receipts.

Latest recorded validation: Segment 1V passed **33 focused tests** and the
checkout client/Worker build. This count includes overlapping regressions and
must not be added to earlier segment totals as a unique or full-suite count.
Actual browser recovery, cross-computer behavior, Windows/power-loss checks and
the full live private-payment flow remain pending. Existing build warnings and
dependency findings remain for review; no fresh audit is claimed.

Remaining sequence:

1. Verify local browser sign-in, separate accounts, wallet/history downloads and
   recovery on the trusted computer.
2. Validate live account scans, deposit simulation and gas quotes; connect the
   gated controller and check actual browser wallet behavior. Obtain explicit
   user approval for a small test deposit, then verify finality, spendability
   and restore/resynchronization.
3. Complete reviewed request-to-proof-to-settlement integration, matching
   merchant receipt of funds, pending/interrupted handling and once-only invoice
   reconciliation. Add encrypted private receipts for buyer and merchant.
4. Verify public receipt downloads and shared counter behavior on mobile.
5. Run the full private test and attack comparison, review dependency/logging
   blockers, capture reproducible evidence and prepare the submission demo.

Scope decisions: KYC remains postponed until after testing and a timeline
review. The first private test can use request-file import; QR/payment links
and email receipt notifications are unbuilt follow-up options. Real-money
release and production private-wallet hosting are outside this milestone.

Documentation updated: README status/evidence table, planned attack-demo wording,
test-checklist checkpoint and this build-log entry. Historical records retained.
This update changes documentation only; validation consists of checking the
recorded reports, local documentation links and Git diff. No application tests
or build were rerun for this documentation update, and no new payment, private
runtime deployment or merge was performed.

AI assistance: Codex consolidated the existing implementation and validation
records at McLean's request.

## September 10, 2026 - Segment 1W: request-specific private-funds check

Resumed the interrupted payment-check scaffold after Segment 1V. Connected
validated imported merchant requests to authenticated account wallet scans and
added the local **Check private funds** interface. The result reports spendable
test-USDC coverage, exact shortfall and expiry. It does not include fees, reserve
funds, authorize payment, generate a proof or submit a transaction.

The API rejects injected wallet selectors, balances and endpoints. The client
captures the existing wallet and request before asynchronous token lookup and
matches returned identity, full terms, scan timestamp and integer balance
arithmetic. Expired/incomplete results and account changes fail. Request
replacement or clearing discards the UI result and aborts its browser request.
Results remain in memory and do not affect history, receipts or usage counts.

Validation: **27 focused tests passed** and the checkout client/Worker build
passed. Seven new payment-check tests cover amount coverage, one-unit shortfall,
expiry/session limits, immutable terms, incomplete/stale scans and response
tampering. Existing account, request and local HTTP regressions passed. Real SDK
workers reject unauthorized checks and controlled wrong-chain preflight while
preserving recovery. Successful balance checks use controlled scan responses;
actual browser interactions and live funded-account checks remain pending.

No dependencies changed; existing build warnings and dependency findings remain.
No fresh audit, full-repository test run, private payment, main-branch merge or
hosted deployment is claimed. KYC stays deferred. Next: actual local wallet and
history recovery, live sync/deposit validation, followed by private settlement
and encrypted receipts. See privacy/SEGMENT-1W.md and its validation report.

AI assistance: Codex completed, tested and documented this segment at McLean's
direction.

## September 10, 2026 - Segment 1X: deposit activity and read-only recovery

Connected the browser account journal and canonical receipt verifier to the local
wallet screen. Users can reopen saved approval/deposit attempts, inspect historical
status, and explicitly recheck the original transaction. A missing hash can be
provided only for an existing record and must match its sender, nonce, calldata,
fee bounds and chain before adoption. Unknown or pending results never resend.

The recovery controller exposes only list/recheck and allows only four read RPC
methods. Account or selected-wallet changes, navigation and a 30-second timeout
discard late results. Account checks now run inside the Web Lock before queued
reconciliation writes; listing history does not write or initialize storage.
The screen shows validated display fields and fixed errors, preserves corrupt
history, and distinguishes prior saved status from the latest chain observation.

Validation: **24 focused tests passed** (8 new activity checks, 12 controller/
journal/receipt regressions and 4 account-client regressions). The client/Worker
build passed. Tests use controlled wallets/providers/storage; actual browser,
live RPC and funded deposit validation remain pending. Existing dependency/build
warnings remain; no dependency changes, new audit or full repository run.

No signing path was enabled, no onchain transaction was sent, no private merchant
payment settled, and no main merge or hosted deployment occurred. KYC remains
deferred. The 0.5%-1% commercial-fee idea is tabled at McLean's request.

Next required gate: real local sign-in and recovery on the trusted computer,
followed by live/forked Sepolia deposit validation, gated signing UI integration
and an explicitly approved small test deposit. Private settlement and encrypted
merchant receipts remain outstanding. See privacy/SEGMENT-1X.md and its report.

AI assistance: Codex implemented, tested and documented this segment at McLean's
direction.

## September 11, 2026 - Segment 1Y: bounded dependency security update

Pinned private-runtime Axios 1.18.0, dset 3.1.4, js-yaml 4.3.2 and bn.js 4.12.5,
plus ws 8.21.3 in both components. Version-scoped overrides preserve the separate
major-version APIs. Existing RAILGUN/Privy/viem/prover pins and vendored crypto
source remain unchanged. No forced SDK downgrade or signing integration.

Fresh production audits: private runtime 28 -> 5 affected-package entries
(5 low); checkout 25 -> 23 (23 moderate). Both now have zero high/critical
findings. Remaining elliptic and wallet-connector findings are documented, not
accepted as safe. Historical segment audit counts above remain historical.

Validation: 127 private-runtime tests and 38 checkout tests passed, as did the
client/Worker build and fresh offline SDK wallet/recovery and synthetic-proof
checks. Invalid proof inputs were rejected. Four dependency tests passed again
after adding implicit-key pollution cases. Lockfile install dry-runs passed;
clean-install, browser and live/funded checks are not claimed. Existing GraphQL
Mesh peer mismatches and build warnings remain. See privacy/SEGMENT-1Y.md and
privacy/reports/segment-1y-validation.json for reproduction and residual risks.

No transaction signing/broadcast, private settlement, main merge or hosted
deployment. The next trusted-computer gates remain local browser recovery and
live/forked Sepolia deposit validation. KYC remains deferred and the commercial
fee idea remains tabled.

AI assistance: Codex reviewed, updated, tested and documented this segment at
McLean's direction.

## September 11, 2026 - Segment 1Z: offline security and submission preparation

Completed the unblocked dependency/call-path review and added streaming byte
limits to direct RPC, ethers, TXID GraphQL and POI transports. Decoded RPC/history
responses are capped at 8 MiB and POI at 1 MiB. Oversize/aborted bodies are
cancelled; a single growing buffer bounds retention across tiny chunks. The
actual Axios POI adapter remains endpoint scoped. Dependency pins are unchanged.

Added a reproducible three-case offline rule demo. The real approval adapter
accepts matching terms and rejects recipient substitution before SDK-double
calls; a separately labeled unprotected fixture accepts the substitution. The
comparison performs no cryptographic proof, signing, token transfer or attack
against an external system. It is not a settled private-payment demonstration.

Validation: 132 privacy tests and 38 checkout tests passed; 23 transport/runtime
checks passed again after the bounded-buffer refinement. An outdated JSON-only
fetch test double was replaced with a real Response. Reviewed first-party log
sites, tracked configuration names and 22 JSON evidence reports for sensitive
value fields. No such fields found in those reports; no complete secret scan
or security certification is implied.

Prepared CHECK_IN_2.md, SUBMISSION.md, DEMO_RUNBOOK.md and SECURITY_REVIEW.md.
Reviewed current sponsor requirements: Privy financial flow fits the working
public payment; other targets need their specific functional integrations.
The exact deadline and judging schedule remain unverified because the public
overview/schedule could not be read. McLean can confirm them in the dashboard.

Private settlement and encrypted receipts remain further engineering after the
trusted-computer wallet/deposit gates. No gate was bypassed and no private signing,
main merge or hosted deployment occurred. The hosted implementation is still
through Segment 1O. KYC and commercial fees stay deferred. See Segment 1Z and
its validation report for the completed work and remaining dependencies.

AI assistance: Codex implemented, tested, reviewed and drafted the materials at
McLean's direction. No check-in, submission or judging commitment was sent.

## September 11, 2026 - Windows checkout path repair

McLean's first Windows clone downloaded the repository successfully but could
not check out `docs / BUILD_LOG.md`: the directory name ended in a space.
Renamed the log to `docs/BUILD_LOG.md`, preserving all existing entries, and
removed the leading space from the filename. Moved the other document in the
same invalid directory to `docs/PAYMENT_RULES.md` without content changes and
updated the README link. No application code changed.
Reviewed tracked paths for Windows-invalid characters, trailing dots/spaces and
reserved device names. Actual Windows checkout confirmation remains with McLean.
The failed local clone can be preserved while a fresh clone verifies the repair.

## Windows private-test repair after the first desktop run

McLean confirmed clone 7e22070, checkout install, 38/38 checkout tests and both
client/server build stages on Windows (Node 24.21.0, npm 11.19.0,
Git 2.55.0.windows.5). The production checkout audit matched the recorded 23
moderate findings. Private packages installed with 5 low findings and the
existing GraphQL Mesh peer-version warnings. The first private run passed
111/132 tests, with 21 failures; that result was not treated as readiness.

Reproduced the history-store failure on Linux by directing test temporary
files through a path alias. The account/history fixtures now pass realpath-
resolved temporary directories to the unchanged strict storage checks. This
matches the local CLI's existing canonical-path setup. POSIX permission tests
are explicitly skipped on Windows; hard-link/file-shape checks still run.
The separate dangling-symlink test skips only if Windows denies fixture
creation. These skips do not establish equivalent Windows ACL protection.

The review-cache fixture now shares one clock between the review and cache,
preserving the production five-minute lifetime limit. Account preflight now
checks the RPC chain before opening the artifact cache; full deployment and
verification-key checks still follow and repeat the chain check. A fresh clone
can therefore reject a wrong-chain provider without predownloaded proof files.

Validation: all 134 private tests passed (zero skips/failures) in a fresh Linux
source copy with no artifact cache and an aliased temporary directory. Installed
dependencies were reused unchanged. git diff --check and the modified runtime's
syntax check passed. Native Windows retesting is still required. No signing,
deployment, wallet credentials, fee settings or dependency versions changed.

## Windows integration-test timing follow-up

At 50c51f1, McLean's Windows suite reported 128 passed, 3 platform-specific
skips and 3 cancellations at the overall integration-test limits (45, 90 and
120 seconds). The isolated account-sync file still cancelled at 45 seconds;
parallel suite contention alone therefore did not explain completion limits.
These cancellations were not recorded as passing tests.

Added `npm run test:wallets` to run only the three affected files sequentially.
The Windows-only total test limits are now 180 seconds for account sync,
360 seconds for account recovery and 480 seconds for the larger HTTP scenario.
Each scenario performs many independent SDK worker starts and password KDF
operations. All assertions, application worker/request/RPC deadlines, session
expiry, KDF settings and private signing gates remain unchanged. Finite larger
test budgets are a diagnostic step, not proof that Windows integration works.
Fixed-label stage diagnostics report only monotonic elapsed milliseconds and
identify the last completed phase without printing credentials or wallet data.

Validation: the focused Linux run passed all 10 tests with no failures,
cancellations or skips in 63.8 seconds. The three large scenarios completed in
29.8 seconds (HTTP), 12.2 seconds (sync) and 14.7 seconds (account recovery),
with their phase timings visible. git diff --check passed. No runtime source,
dependency version or lockfile changed. The rest of the already-verified suite
was not rerun for this test-only change. Native Windows retesting remains next.

## Windows focused wallet integration checkpoint passed

McLean supplied the completed `npm.cmd run test:wallets` output from Windows at
90e68be: 10 tests, 9 passed, 0 failed, 0 cancelled and 1 expected POSIX-only
permission/symlink fixture skip. The three previously cancelled scenarios now
completed: local HTTP wallet creation/recovery/request history in 86,621.3039 ms,
account sync and preflight/recovery checks in 42,441.9072 ms, and independent
account wallets with fresh-process recovery in 43,010.7616 ms. Phase diagnostics
reached each scenario's final recovery or authorization checks.

The runner reported a total duration of 2,231,135.988 ms. This is recorded as
supplied; the cause of the difference from individual test durations was not
established. The result is a focused Windows rerun, not a new 134-test full-suite
pass. Earlier passing Windows checks remain recorded in the preceding entries.
The POSIX-only skip does not validate Windows ACL protection.

Next is the actual loopback browser workflow: public Privy configuration,
sign-in, account wallet creation and encrypted backup/recovery, followed by
merchant request/history checks. Live sync/deposit review and full private
settlement still require their separate gates. This checkpoint changes only
documentation; no runtime source, dependencies, signing gate or deployment
changed. No tests were repeated for this documentation update.

## September 12, 2026 - Desktop recovery checkpoint and wallet layout cleanup

McLean confirmed local browser sign-in after adding the loopback origin in
Privy. Following a chat link triggered the existing cross-site rejection;
pasting the address directly opened the page. Both accounts created private
wallets and downloaded/verified their encrypted recovery files. The merchant
created a 1-test-USDC request, exported its history backup, and the buyer opened
the request with matching terms. In separate recovery storage, the buyer's
restored address matched and McLean reported merchant wallet/history recovery
with a matching request. These are user-reported desktop checkpoints, not a
new independent review of the user's private files.

Pinned test artifacts prepared successfully on Windows. The subsequent buyer
balance sync returned the generic wallet-operation error; no balance was
verified. Codex separately passed the configured public deployment/circuit and
POI prerequisites at finalized Sepolia block 0xb25280. This does not establish
Windows connectivity or successful account-bound history scans. Sync diagnosis
remains open; no runtime deadline or security check was weakened.

At McLean's request, reorganized the local wallet page into Wallet, Pay a
request, Request payment and Recovery views. Removed the marketing column from
this workspace, showed the signed-in email, and replaced the always-visible
action/form stack with one task form. Buyer imports are separate from merchant
creation/history. Saved requests use a compact expandable list with one selected
detail; creating/selecting a request collapses the list. Amount, network, expiry
and unchecked-payment status remain clear; full references/addresses expand on
demand. Recovery/history backups have their own view, and test deposit tools are
collapsed under Wallet. Existing stored requests and wallets are retained.

Switching tasks clears password inputs and request details; changing accounts
still unmounts account-scoped state. The private-address disclosure now explains
how to load the address after a status-only refresh. API calls, request-file
validation, encrypted storage, expiry checks and signing restrictions are
unchanged. This layout change does not resolve the outstanding sync failure.

Validation: 38 checkout tests passed. Local component interaction checks with
synthetic API responses passed task navigation, single-form rendering, request
creation/history selection/import, recovery form selection, password clearing,
visible sync errors and account-change cleanup. Production client/server build
passed with existing chunk-size and worker externalization warnings. The cloud
browser could not reach the loopback preview (ERR_BLOCKED_BY_CLIENT); desktop
and phone visual review of the new layout remains with McLean. No real wallet,
secret or transaction was used by the component checks. No main merge or hosted
deployment occurred.

## September 12, 2026 - Windows preflight and private-sync diagnostics

McLean confirmed the reorganized desktop layout and reported Check my wallet:
"Wallet and recovery password checked. The wallet is now locked again."
The Windows deployment preflight then returned
`reviewed-deployment-and-circuit-matched` on Ethereum_Sepolia (11155111), at
finalized block `0xb25892`, hash
`0x7301e0901a30a428bf24c4d3500e7aa09733671874d2699fa6c35c740d2ec2c8`.
The reviewed proxy/implementation/relay runtime hashes, unpaused proxy, relay
target and circuit 01x02 verification key matched. `paymentReady` remained false.
This is Windows contract/circuit evidence, not a completed account scan.

Added a trusted local-server diagnostic callback for failed sync workers. The
worker sends only allowlisted stage and reason labels over its private IPC
channel; the parent validates the labels again before the CLI prints one
`[Private balance check]` line. Stages distinguish wallet recovery, public
prerequisites, provider loading, history scans, waiting for this wallet's balance
update, balance reading and shutdown. HTTP errors remain generic. Raw exception
text, account identifiers, wallet addresses, balances, credentials and URLs are
not diagnostic fields. Request-supplied diagnostic configuration is rejected.

Validation: five focused sync/diagnostic tests passed, including real isolated
SDK workers, rejected authentication, wrong passwords and wrong-chain rejection,
unchanged generic errors, a throwing diagnostic reporter, and preserved recovery.
Three HTTP origin/authentication/rate-limit/upload-boundary tests passed. After
refining the pending-history and wallet-update labels, the three affected scan
and diagnostic tests passed again. Modified runtime syntax and diff whitespace
checks passed. No dependency or frontend changes require reinstalling/rebuilding.

Two disposable, unfunded account scans against the configured public Sepolia
services produced different failures: first `history-scan: TIMEOUT`, followed by
a successful wallet recovery check; then `shutdown: CHECK_FAILED`, followed by
a failed recovery check. The second worker exited without a success/failure
payload; the cause is not established. Both temporary test directories were
removed after their workers exited. Neither attempt is recorded as a successful
account scan, and no transaction was sent. The Windows failure still needs its
own diagnostic. No deadline, storage lock, validation or signing gate was relaxed.

The Windows runbook preserves the existing PowerShell session when restarting,
so its recovery-directory setting is retained. Users should report only the
fixed-label failure line, without deleting or recreating wallet storage. Phone
layout review and private payment integration remain pending.

## September 12, 2026 - Windows POI reset and bounded availability retry

McLean supplied the Windows diagnostic `poi-service: ECONNRESET`. The sync
reached the public POI availability query after wallet recovery and deployment
checks, then the connection reset. This identifies the failing prerequisite;
it does not identify which remote host or network intermediary reset the
connection. An independent public query from Codex returned HTTP 200 with a
valid response, so a general service outage was not established.

Extracted the existing public Sepolia validated-TXID availability query into
`checkPOIService`. It retries ECONNRESET once after 250 ms, using the same
endpoint, request body and original 15-second abort signal for both attempts.
It rechecks account/session validity before requests, after replies and before
retrying. Other errors, HTTP failures, invalid JSON/fields, oversized bodies and
cancellation fail closed. The existing 1 MiB decoded-response limit, HTTPS,
redirect rejection, circuit checks and overall sync/worker deadlines remain.
This is only an availability read; no wallet query or payment is retried.

Added `npm.cmd run poi:preflight` for Windows. It loads the existing local POI
configuration and runs the same public query without signing in, asking for a
password, reading account storage or loading a wallet. Output is a fixed-field
JSON result with `paymentReady: false`; failure output contains only the existing
sanitized stage/reason labels. It performs no transactions and does not establish
successful history synchronization or private-payment readiness.

Validation: all 15 focused account-sync, POI-preflight, POI-transport and response
limit tests passed. These include actual isolated account workers, one-reset
recovery, persistent resets capped at two attempts, no retry of invalid/oversized
or HTTP-error responses, session expiry, abort during retry/body reads, and CLI
error redaction. After preserving TimeoutError across an interrupted retry delay,
all five POI-preflight tests passed again. The actual new CLI returned
`poi-service-ready` from Codex's environment. Syntax and diff whitespace checks
passed. No dependencies changed and no frontend rebuild is required.

The runbook asks McLean to preserve the existing PowerShell session, stop the
server, pull this update and run the isolated connection check. Windows retest,
the later history/shutdown failures observed separately on disposable wallets,
and successful account synchronization remain pending. No main merge, hosted
deployment or signing-gate change occurred.

## September 13, 2026 - IPv4 POI success and submission handoff

McLean reports eight hours until submission and is at work using a phone's
cellular hotspot. The native PowerShell POST and Node's TLS-1.2-only probe both
failed. The subsequent `--dns-result-order=ipv4first` POI preflight returned
`poi-service-ready`. Test-NetConnection separately reached IPv6 TCP port 443;
that is not evidence of a successful IPv6 TLS/HTTP exchange. The successful
address preference suggests an address-selection/path issue; it does not prove
the carrier or a particular intermediary caused the reset.

Applied the successful preference to `wallet:web` and `poi:preflight`, and to
the isolated account-wallet fork's explicit execArgv. The fork intentionally
discards inherited CLI arguments, so changing the parent launch alone would not
carry the preference to the wallet's reads. No endpoint, certificate-validation,
TLS-version, response-size, session, operation-deadline or signing rule changed.

All nine focused account-sync and POI-preflight tests passed with the new fork
configuration, including actual isolated SDK workers and recovery after rejected
network checks. The offline three-case approval demo passed again. A fresh real
offline synthetic-input proof passed verification and output/approval/recipient/
value tamper rejection; the two expected invalid-witness ERROR: 4 lines preceded
the successful JSON result. Evidence is in
`privacy/reports/submission-checkpoint.json`. Full account sync on Windows and
private merchant settlement remain unverified. No new transaction was sent.

Prepared FINAL_HOURS.md with the restart/sync check, existing public receipt hash
lookup, short narration, local request/recovery demonstrations, offline proof
and rules commands, and a submit-with-buffer checklist. Updated submission text
and the README to reflect user-confirmed Windows wallet/history recovery and the
latest limits. The eight-hour budget is user-supplied; the public event/prize
pages returned errors again, so the signed-in portal remains authoritative for
the deadline, video limit and final sponsor selections.

Read-only Sites inspection confirmed that published version 3 is owner-restricted
at the existing hosted URL. Judges cannot yet use it as a generally accessible
demo. The access tool and Sites instructions require an explicit audience-change
request, so no public access grant, invitation, source publication or deployment
was performed. That decision does not block preparing the complete submission
package or the local IPv4 repair. The user still needs to authorize judge access,
record/upload the video, review portal fields and submit before the deadline.


## September 13 — private synchronization recovery

The Windows account scan timed out and stranded an empty per-account lock. After verifying no Node processes remained, McLean removed only that empty lock, reopened the saved buyer wallet, and successfully checked its recovery password. The existing hosted testnet demo was subsequently made public with explicit approval; McLean confirmed homepage access in a private browser window and reopened the prior public 1 USDC receipt. None of those steps completed a private payment.

The isolated account parent now owns each newly acquired storage lease and releases it after the child closes, including forced termination. Pre-existing locks are never reclaimed automatically, and nonempty or replaced locks remain for manual review. The first scan has a bounded five-minute budget, with a 320-second worker deadline and 325-second client deadline; RPC and response-size limits are unchanged.

A live disposable-account reproduction traced the shutdown crash to Engine 9.6.0's asynchronous refreshPOIsForTXIDVersion, which could still be running when the database closed. The account worker now tracks its wallet's decryption and POI jobs, fails the operation on their errors, pauses polling, and drains pending work before closing the engine database. Network sockets belong to the isolated process and end with it. No user wallet or password was used by Codex.

Validation: six lock/sync tests and two lifecycle tests passed. A fresh real Sepolia account scan then passed in 92 seconds, with UTXO and TXID histories complete and zero spendable test USDC, followed by successful recovery at 93 seconds. Reviewed finalized block: 0xb2732d, hash 0x37a6b11dd637c527a11d97fd6f58b986e6dd1d3348408f2087fced6f2c9ebdca. Windows confirmation remains pending. This fixes synchronization; private deposit submission, broadcaster integration and merchant settlement are still being completed.

## September 13, 2026 - Windows account scan and approval preflight confirmed

McLean supplied the local application's successful account-history result,
displayed at 5:28:34 AM on September 13: zero spendable private test USDC and
the wallet locked again. This completes the user-side Windows scan checkpoint
that was pending in the preceding entry. It is a balance snapshot, not evidence
of a funded private wallet.

The next live deposit review showed 2 test USDC from the public funding wallet,
a 0.005 test-USDC protocol fee and 1.995 test USDC expected privately. The
application then reported successful simulation of the exact 2-USDC approval,
with a maximum network-fee quote of 0.00014077751886048 Sepolia ETH and displayed
expiry of 6:01:00 AM. The supplied text did not specify a timezone. The fee is
approval-only, time-limited and must be refreshed before use; a separate deposit
simulation and fee check are still needed after allowance is available.

Evidence is user-provided application output, not a new independent RPC query.
No approval/deposit hash was supplied, and the user's build explicitly reported
approval and deposit submission disabled. The 1.995 amount is expected credit,
not received funds. Wallet addresses and recovery data are omitted from the
new public report. See `privacy/reports/local-funding-checkpoint-2026-09-13.json`.

Updated the test checklist to distinguish completed synchronization, deposit
review and approval simulation from the remaining deposit simulation, signing,
canonical receipt, spendability and recovery checks. The broader private-payment
integration remains local work in progress; this checkpoint does not publish or
enable its signing controls. No transaction, merge or hosted deployment was
performed. KYC remains deferred.

Validation for this checkpoint: report arithmetic, JSON structure, documentation
links and scoped Git diff. No application test suite was rerun for these
documentation changes. AI assistance: Codex recorded McLean's live test results
and the remaining validation gates.

## September 13, 2026 — local ZK payment integration

Implemented the actual local RAILGUN private-payment path requested by McLean:
fresh spendable-balance and broadcaster fee quotes, explicit buyer confirmation,
real transfer/POI proving, contract proof verification, immutable encrypted
pre-send records, broadcaster submission, and buyer/merchant receipt matching.
The existing public deposit controller now has a fresh authenticated simulation
gate and explicit separate approval/deposit wallet confirmations in the UI.
No transaction was sent by Codex and no user secret was used.

The new Waku broadcaster client is pinned to 9.1.1. Added integrity-pinned 01x03
and POI_3x3 proving artifacts; both verification keys were independently derived
from their pinned zkeys. A real synthetic 01x03 Groth16 proof and four tamper
cases passed. Its key matched the reviewed finalized Sepolia deployment at
0xb27368, hash 0xb21e8cb70fcf66f45cee8d17889dfd0ff1d23afd56cd624b7dbb0f48a5915f41.
These synthetic notes do not establish a funded transfer or settlement.

Separate source review identified and verified fixes for installing the prover
and POI setup before wallet loading, recovering from an unrelated broadcaster
acknowledgement, blocking replacement payments after an outer transaction
revert, and skipping unsupported incoming transaction shapes without hiding
other merchant receipts. An acknowledgement hash remains an unverified candidate
until it matches the exact authorized calldata and canonical receipt. A delivered
private proof has no onchain expiry: pending, unknown and reverted attempts
continue to block replacements. The application has no cancellation UI.

Validation: ten final private-payment/security tests passed with explicitly
labeled SDK/RPC/broadcaster doubles. A preceding 39-test checkout run and 37-test
focused private/API run passed; 17 affected checkout tests passed after the final
review changes. Twelve deployment/account-lock tests passed. The production
client/server build and private lockfile install dry run passed. Existing bundle
size and peer-dependency warnings remain. The private production dependency audit
reported five low and five moderate findings, with no high or critical findings.
This source review and dependency report are not an independent security audit.

After the final prover/POI changes, a real disposable unfunded account scan passed
in 97 seconds and recovery at 98 seconds: both histories complete, zero spendable
private test USDC, checked at 2026-09-13T10:02:23.177Z. Reviewed finalized block:
0xb273fd, hash 0x5aa15e5470d10e83ec485c2692d161832fc335e49a6babb5dc0f00a0db98a855.
The preceding live attempt timed out at the RPC deployment check and still
recovered. No funded wallet, outgoing payment POI or merchant settlement was
validated by these scans.

Broadcaster discovery was unavailable from the development environment within
the bounded 95-second preflight. The next Windows gate is that read-only check,
before funding. ZK_FLOW.md gives the exact install/artifact/build sequence and
separate live wallet confirmations. Full completion still requires a funded
private send, outgoing POI, a matching merchant receipt, and recovery afterward.
The encrypted payment journal is not part of existing wallet/history backups;
the reviewed path supports one input and two or three outputs. The hosted public
demo is unchanged. This work stays on the draft branch and does not merge main.

See privacy/reports/zk-flow-validation.json for the evidence and remaining gates.
AI assistance: Codex implemented and tested the flow, used a separate source
reviewer as required by the ETHSkills shipping workflow, and prepared the Windows
handoff under McLean's direction. KYC remains deferred.

## September 13, 2026 — broadcaster diagnostic output on Windows

McLean installed 848 packages and reported that all six added transfer/POI
artifacts passed their pinned checks. The subsequent broadcaster command
returned to PowerShell without its required JSON result. This is neither a
successful discovery nor evidence that the broadcaster network is unavailable;
the exact cause of the missing Windows output has not been reproduced.

The diagnostic previously printed only from the worker's close event and waited
for SDK shutdown before reporting discovery. It now writes a startup line and
one final result synchronously, independently of cleanup/close. An explicit
argument identifies its private worker, so an inherited IPC channel cannot
redirect top-level output. Early exit, disconnect, spawn failure, invalid IPC and
the 95-second deadline each produce a fixed failure reason. Only an actual
discovery result can report ready. This disposable process opens no account or
wallet, uses no password and sends no transaction; its sockets end on exit.

Five focused tests passed, including real subprocess IPC/early-exit checks,
missing close events, a hanging worker, malformed messages and sanitized output.
A live development run printed its startup line, then
`private-broadcaster-unavailable` at `discovering-broadcaster` with reason
`discovery-failed`, and exited with code 1. This confirms diagnostic output, not
broadcaster availability. The Windows result still needs confirmation.
This diagnostic-only update needs
no dependency reinstall or frontend rebuild. The funded private-payment gate
remains open and the signing/proof/broadcaster selection logic is unchanged.

## September 13, 2026 — distinguish Waku connection and fee discovery failures

McLean's clean Windows retry produced the expected startup and final JSON:
`private-broadcaster-unavailable`, stage `discovering-broadcaster`, reason
`discovery-failed`. A separate Windows TCP probe to `45.76.18.7:30304` succeeded.
That reaches an advertised peer's port but does not establish a libp2p/Waku
handshake, service subscription or eligible Sepolia test-USDC broadcaster.
The earlier cursor/output overlap is not the cause of the repeatable failure.

Development diagnosis decoded three signed peer records from the configured
RAILGUN DNS directory. Google and Cloudflare DNS-over-HTTPS both answered.
The client stored three peers but connected to none; direct TCP probes returned
ENETUNREACH in this environment. This cannot be used to attribute McLean's
different Windows failure to his hotspot or to declare Sepolia fees unavailable.

The existing read-only preflight now samples the same pinned client used by
payment discovery. Its final JSON retains peak discovered/connected peer counts,
advertised Filter/Store/LightPush protocol counts, configured topics, eligible
Sepolia/test-USDC offer counts, fixed SDK events and fee rejection counters.
SDK raw messages, peer identities, addresses and payloads are not printed.
An optional guarded diagnostic observer leaves network options, signatures,
POI requirements, expiry, broadcaster selection and payment authorization intact.
Peer-store reads are bounded and polls do not overlap. Samples survive failure,
worker cleanup and the parent deadline; none can turn a failed check into ready.

Ten focused tests passed, including real subprocess IPC, bounded/stalled reads,
sanitization, timeout retention and a throwing observer that cannot change
selection or turn a startup error into success. No wallet or transaction was
opened for these diagnostics. Full Windows discovery and the funded private
payment/merchant receipt gate remain pending. This update requires only a Git
pull and rerunning the diagnostic, without an install or frontend rebuild.

The development run emitted the new final diagnostic successfully: three
discovered peers, zero connected/protocol peers, zero eligible offers and a
fee-history failure. The SDK also reported that it had started despite no peer
connection, confirming why that flag alone must not be treated as readiness.
The final status remained unavailable, with exit code 1. The corresponding
Windows peer/service/offer counters are the next required observation.

## September 13, 2026 — identify the observed broadcaster fee assets

McLean's Windows result at 240381e reached six connected peers, with Filter,
Store and LightPush protocols advertised, 16 fee messages, 11 fee updates and
a peak of ten eligible Sepolia offers. No eligible offer accepted the configured
Circle Sepolia USDC contract, 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238.
The final status remained unavailable at the parent deadline. This establishes
that Waku communication and eligible fee messages reached Windows; it does not
establish ten unique broadcasters or a compatible fee offer.

The diagnostic now reports the requested fee-token contract and a sorted,
deduplicated list of at most 16 public contract addresses from the pinned SDK's
eligible Sepolia offers. It preserves observations after expiry and worker
timeout, strips malformed/zero addresses and extra payload fields, and derives
a fixed fee-token observation label from the counters. No peer or wallet
addresses, raw messages, private files or secrets are logged. Observed alternatives
cannot select a payment token or make a failed check ready.

The upstream broadcaster example at ec49691533b4edc2dafefbd8cdb5f611290b2115
configures Sepolia WETH, WETH_ALT, DAI and USDT labels, without Circle test USDC:
https://github.com/Railgun-Community/ppoi-safe-broadcaster-example/blob/ec49691533b4edc2dafefbd8cdb5f611290b2115/src/server/config/config-tokens.ts
This reference configuration is not evidence that a particular live provider
accepts those contracts, nor verification of their code/identity. The WETH
contract in that example also differs from the pinned shared-models default.
The Windows contract list is therefore required before selecting a fee asset.
Circle documents the separate Sepolia test-USDC contract and that testnet tokens
have no financial value: https://developers.circle.com/stablecoins/usdc-contract-addresses
The user's conditional offer of real USDC does not change this testnet scope.

Source review of wallet 10.9.0 tx-generator and engine 9.6.0 transaction-batch
confirms the SDK places the broadcaster fee first and groups outputs by token.
A separate fee asset would need its own verified spendable balance, exact units,
explicit quote and deposit path, plus multi-batch proof and receipt verification.
The current application still requires same-token USDC payment and fee, and its
verification gate accepts one proof batch. No token was silently substituted,
no public-wallet broadcast fallback was enabled and no signing path changed.

Validation: all 12 focused broadcaster diagnostic/preflight tests passed.
Cases include mixed-case address deduplication, invalid/zero addresses, bounded
output, expired-offer retention, parent IPC sanitization and alternative offers
remaining unavailable at timeout. No wallet was opened or transaction sent.
Live fee-token identification, compatible fee-path implementation and the funded
private transfer/merchant receipt remain pending. This update needs only a Git
pull and the existing preflight command on Windows; no reinstall or build.
