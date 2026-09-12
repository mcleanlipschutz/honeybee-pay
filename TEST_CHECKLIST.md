# Honeybee Pay: first end-to-end test

Updated September 12, 2026. Checked items are implemented/validated as stated;
they do not imply a live payment has settled.

## Current checkpoint: Segment 1Z

Windows follow-up: checkout installed, all 38 checkout tests passed, and both
client/server builds completed on McLean's computer. The production checkout
audit matched 23 moderate findings. Private packages installed with 5 low
findings; the initial private suite passed 111/132 tests. Test-fixture path and
clock repairs plus an earlier wrong-chain rejection now pass 134/134 tests in
a fresh Linux checkout with an aliased temporary directory and no artifact
cache. Windows subsequently reported 128 passed, 3 skipped and 3 cancelled by
overall test deadlines; isolated account sync also timed out at 45 seconds.
The affected multi-operation tests now have finite Windows-specific total
budgets and timing diagnostics, plus a sequential `npm.cmd run test:wallets`
command. At 90e68be, McLean's focused Windows rerun passed 9 tests with 0 failures,
0 cancellations and 1 expected POSIX-only skip. The HTTP, sync and independent
wallet/recovery scenarios completed in 86.6, 42.4 and 43.0 seconds respectively.
This resolves the three previously cancelled automated scenarios; it is not a
new full-suite run. McLean subsequently confirmed local browser sign-in, separate
buyer/merchant wallet creation and backup verification, buyer recovery with a
matching address, and merchant wallet/history restoration with a matching request.
Individual runtime deadlines remain unchanged.
Explicit Windows skips do not validate POSIX permissions or Windows ACLs.

The public mobile payment milestone is verified. Private wallet setup/recovery,
deposit preparation, merchant request files, encrypted request history and
separate history backup/restore, request-specific private-funds checks and local
deposit activity/reconciliation are implemented with the validation limits below.
Segment 1Z passed both JavaScript suites (132 private, 38 checkout), a 23-test
focused transport rerun and the offline approval comparison. It adds bounded
remote-response readers, residual-risk notes and submission/demo materials.
Segment 1Y's build, wallet/proof checks and audit evidence remain recorded:
5 low private-runtime and 23 moderate checkout findings, zero high/critical.
This is not a live private-payment test or a complete security approval.

The next gate is live account synchronization and deposit validation. McLean's
balance scan returned a generic wallet-operation error; no balance was verified.
McLean subsequently passed Check my wallet and the deployment/circuit preflight
on Windows at finalized Sepolia block 0xb25892. Public POI prerequisites passed
separately from Codex's environment. McLean's Windows diagnostic then identified
`poi-service: ECONNRESET`; the POI availability connection reset. That public
read now retries a reset once within its existing 15-second deadline, and
`npm.cmd run poi:preflight` checks the connection without opening wallet storage.
The isolated connection check passed from Codex's environment; Windows retesting
and successful account synchronization remain pending.
The local server now reports a sanitized fixed-label sync stage and reason in
PowerShell; HTTP errors remain generic. Private signing
remains disabled, the submission controller is not connected to the UI, and no
complete private merchant payment has settled. The hosted mobile site remains
on the public checkout/receipt/counter implementation through Segment 1O.

For the first private-payment test, use the implemented request-file import.
QR/payment links remain a follow-up delivery option. Public receipt history and
downloads provide the implemented alternative to email notifications; email
delivery is still unbuilt. Encrypted receipts for settled private payments remain
a required part of the full test.

See the [project status](README.md#current-status) and
[latest validation report](privacy/reports/segment-1z-validation.json).

## Scope decision

**KYC is postponed until testing is complete.** After testing, review the time
remaining before final hackathon submission. KYC may be added after the contest.
The testnet demo collects no identity documents and does not claim verified legal
identity. This decision applies to the controlled testnet demo, not a real-money
release.

## Wallet setup and recovery

- [x] Email sign-in and embedded public-wallet integration implemented.
- [x] Separate account-bound RAILGUN wallets with encrypted recovery implemented.
- [x] Browser wallet creation, backup download, saved-file verification and restore UI implemented.
- [x] Local authenticated API and client integration tested against the real wallet SDK.
- [x] Cross-account access, forged tokens, backup tampering and overwrite protection tested.
- [x] KYC separated from authentication and removed from testnet readiness blockers.
- [x] Configure the real Privy App ID and its public verification key; local startup passed.
- [x] Email enabled in Privy (confirmed from the user’s dashboard screenshot).
- [x] Mobile hosted-wallet view implemented; private recovery remains local.
- [x] Verify live mobile email login and the same embedded wallet after sign-out/sign-in (user screenshots).
- [x] Allow the exact local demo origin in Privy and enable email/embedded wallets (user-confirmed local sign-in).
- [x] Test actual sign-in/sign-out with separate buyer and merchant email accounts (user-reported).
- [ ] Complete desktop/mobile browser checks, including password clearing and account changes.
- [x] Save buyer/merchant backups through the browser and verify recovery in a separate storage folder after restart (user-reported; buyer address matched).
- [x] Separate wallet, buyer request, merchant request and recovery tasks in the local UI; show one selected request detail.
- [x] Confirm the reorganized layout on McLean's Windows browser (user-reported).
- [ ] Confirm the reorganized layout at phone width.

## Public payment and receipt milestone

- [x] Buyer and merchant created separate embedded wallets through email login.
- [x] Buyer funded with 20 test USDC and 0.05 Sepolia ETH.
- [x] Live public 1-USDC payment verified onchain; buyer 19 USDC, merchant 1 USDC at verification.
- [x] In-app Payment received screen confirmed by user screenshot.
- [x] Receipts history reader and download interface implemented; live reader returns matching sent/received receipt references.
- [ ] User confirms Receipts tab and downloaded copy on phone, for both accounts.
- [ ] Implement encrypted private receipts and invoice reconciliation for the ZK flow.

## Funding and privacy

- [x] Local proof verification and tamper checks passed.
- [x] Disposable demo wallets completed read-only Sepolia history synchronization.
- [x] Connect synchronization to account-bound wallets (Segment 1P implementation and controlled tests).
- [ ] Run a live account-bound scan and confirm the private balance snapshot on the local test machine.
- [x] Fund the buyer’s public wallet with Sepolia test ETH and test USDC.
- [x] Build account-bound test-USDC deposit review with exact unsigned approval and protocol fee (Segment 1Q; controlled tests).
- [x] Verify prepared shield-note recovery in a fresh SDK database and rejection by another wallet.
- [ ] Validate the deposit review against live/forked Sepolia state on the local test machine.
- [x] Add fresh deployment/token/fee checks, exact-call simulation and bounded gas quotes (Segment 1R; controlled tests).
- [x] Bind fee checks to the server's account-specific review and preview the next wallet-confirmation step.
- [ ] Validate simulation and gas quotes against live/forked Sepolia state.
- [x] Implement wallet submission controller with exact nonce/gas/fee requests and a closed default signing gate (Segment 1S; fake-wallet tests).
- [x] Implement browser attempt journal and read-only approval/Shield verifier; controlled tests cover reloads, concurrent attempts, unknown outcomes and canonical event matching.
- [x] Connect the account-scoped journal and read-only verifier to local Deposit activity; list historical attempts and recheck original hashes without signing (Segment 1X).
- [x] Make journal reads non-writing and check account state inside queued reconciliation writes; tests reject late results, wrong wallets and changed transactions.
- [ ] Test actual browser activity reopening, missing-hash entry, account changes, timeouts, Web Locks and storage failures.
- [ ] Wire the signing controller into the local UI after live validation; verify actual Privy prompts and browser persistence.
- [ ] Integrate explicit wallet approval and shield submission, carrying reviewed gas/fee limits and handling pending/unknown outcomes.
- [ ] Confirm the exact deposit transaction and matching canonical Shield event without automatic resending.
- [ ] Confirm the new account's shielded balance is spendable before enabling payment.
- [ ] Restore and resynchronize a wallet after shielding.

## Merchant payment

- [x] Create an account-bound local merchant request with private recipient, amount, token, chain, expiry and unique ID (Segment 1T; actual SDK/API tests).
- [x] Implement request-file download and buyer import/review; validate checksum/address, exact terms, expiry and account changes.
- [x] Test immutable transfer-adapter terms and reject replacement after review before proving.
- [ ] Verify the request download/import and expiry flow in the actual local browser, including sign-out and account changes.
- [x] Persist merchant requests in encrypted account history and reopen after runtime restart (Segment 1U; actual SDK/API tests).
- [x] Reject corrupt or cross-account history, preserve prior records on interrupted writes, and keep historical expiry separate from payment validity.
- [x] Add local history list, exact request details, active-request downloads and explicit unverified payment status.
- [ ] Verify history reopening and clearing in the actual browser on the trusted computer.
- [x] Add and test encrypted history export/restore with recovered SDK wallets; preserve newer local requests, skip duplicates and reject conflicting records (Segment 1V).
- [ ] Download both backup files in the actual browser and verify wallet → history recovery on the trusted computer.
- [x] Connect imported merchant requests to authenticated private balance scans; validate exact terms, wallet identity, shortfalls and expiry (Segment 1W; controlled success fixtures and real-worker rejection tests).
- [x] Add local “Check private funds” UI with password clearing, request/account replacement cancellation and explicit unchecked-fee/no-authorization wording; checkout build passed.
- [ ] Verify the funds-check UI in the actual browser, including request replacement, expiry, navigation and account changes.
- [ ] Check a real funded buyer wallet against a merchant request; neither a passing fixture nor sufficient principal establishes payment readiness.
- [ ] Follow-up delivery option: open the invoice from a link or QR code and review its exact terms; use the implemented file import for the first test.
- [ ] Generate, submit and settle a real test private transfer.
- [ ] Verify receipt of the matching payment from the merchant's wallet state.
- [ ] Reconcile the invoice once and give both parties a receipt.
- [ ] Handle pending transactions, errors and interrupted sessions without automatic resending.
- [ ] Reject altered recipient/amount and repeated authorization.
- [x] State precisely which checks are application controls and which are independently enforced (SECURITY_REVIEW.md and SUBMISSION.md).

## Final test and evidence

- [ ] Run the complete login → wallet → shield → invoice → private payment → receipt flow.
- [x] Run the protected/unprotected comparison as an explicitly offline three-case demonstration using SDK doubles; no token movement (Segment 1Z).
- [ ] Demonstrate the agreed final payment/attack comparison with the completed private flow; do not substitute offline fixture results for settlement.
- [x] Review first-party logging, tracked environment names and 22 JSON reports for sensitive-value fields (scoped Segment 1Z review).
- [ ] Check final live logs, screenshots and recordings for exposed keys, passwords or personal information.
- [x] Apply compatible dependency pins and rerun production audits, both JavaScript suites and offline wallet/proof checks (Segment 1Y).
- [ ] Review the known dependency findings and resolve blockers for the test environment.
- [x] Document remaining dependency call paths and compatibility blockers; add tested size limits to active RPC/history/POI readers (Segment 1Z).
- [x] Prepare submission description, architecture explanation, AI attribution, demo script, runbook and copy-ready Check-in 2.
- [x] Recheck sponsor requirements; identify Privy financial flow and conditional additional targets without claiming unbuilt integrations.
- [ ] Record reproducible test results, transaction evidence and the demo video.
- [ ] Recheck submission requirements and the official deadline.
- [ ] Review remaining time; decide whether KYC stays postponed until after the contest.

## Deferred work

See [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) for phone tasks and ordered computer
checks. [Segment 1Z](privacy/SEGMENT-1Z.md#what-remains-and-why) distinguishes
user checks from remaining private-settlement engineering. The official schedule
could not be verified through the public event page; check the dashboard.

KYC integration, real-money release, broader merchant operations, production
key custody/recovery, remote hosting of the private-wallet service and any unbuilt sponsor features are outside
this first controlled test. Sponsor eligibility must match demonstrated features.
The commercial 0.5%-1% fee idea is tabled for later; no fee implementation is part
of the current hackathon segment.

The local demo runtime handles decrypted wallet keys and recovery passwords.
Current checkout payments are public test transfers. Neither local wallet setup
nor a valid local proof establishes a settled private merchant payment.


### Shared usage counter (Segment 1O)
- [x] Homepage labels the aggregate as test payments, not real-money adoption.
- [x] Server validates app login, recorded terms, canonical receipt and finality.
- [x] Durable uniqueness prevents buyer/merchant or retry double-counting.
- [x] Automated tests cover recovery after the browser misses hash reporting.
- [ ] On the phone, check the initial count includes the first mobile payment.
- [ ] Make one new approved test payment and confirm the total increases once after finality.
- [ ] Sign out / reload on another device and confirm the same aggregate.
- [ ] Production launch: external access review, throughput/reconciliation, abuse controls and security review.
