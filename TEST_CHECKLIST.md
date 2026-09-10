# Honeybee Pay: first end-to-end test

Updated September 10, 2026. Checked items are implemented/validated as stated;
they do not imply a live payment has settled.

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
- [ ] Allow the exact local demo origin in Privy and enable email/embedded wallets.
- [ ] Test actual sign-in, sign-out and independently controlled buyer/merchant accounts.
- [ ] Complete desktop/mobile browser checks, including password clearing and account changes.
- [ ] Save a backup through the browser and verify recovery after a restart.

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
- [ ] Wire the controller and account-scoped journal into the local UI after live validation; verify Web Locks/storage and Privy prompts in the actual browser.
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
- [ ] Open the invoice from a link or QR code and review its exact terms.
- [ ] Generate, submit and settle a real test private transfer.
- [ ] Verify receipt of the matching payment from the merchant's wallet state.
- [ ] Reconcile the invoice once and give both parties a receipt.
- [ ] Handle pending transactions, errors and interrupted sessions without automatic resending.
- [ ] Reject altered recipient/amount and repeated authorization.
- [ ] State precisely which checks are application controls and which are independently enforced.

## Final test and evidence

- [ ] Run the complete login → wallet → shield → invoice → private payment → receipt flow.
- [ ] Run the protected/unprotected attack comparison as separately labeled test paths.
- [ ] Check logs and saved evidence for exposed keys, passwords or personal information.
- [ ] Review the known dependency findings and resolve blockers for the test environment.
- [ ] Record reproducible test results, transaction evidence and the demo video.
- [ ] Recheck submission requirements and the official deadline.
- [ ] Review remaining time; decide whether KYC stays postponed until after the contest.

## Deferred work

KYC integration, real-money release, broader merchant operations, production
key custody/recovery, remote hosting of the private-wallet service and any unbuilt sponsor features are outside
this first controlled test. Sponsor eligibility must match demonstrated features.

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
