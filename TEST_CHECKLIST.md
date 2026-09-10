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
- [ ] Configure the real Privy App ID and its public verification key.
- [ ] Allow the exact local demo origin in Privy and enable email/embedded wallets.
- [ ] Test actual sign-in, sign-out and independently controlled buyer/merchant accounts.
- [ ] Complete desktop/mobile browser checks, including password clearing and account changes.
- [ ] Save a backup through the browser and verify recovery after a restart.

## Funding and privacy

- [x] Local proof verification and tamper checks passed.
- [x] Disposable demo wallets completed read-only Sepolia history synchronization.
- [ ] Connect synchronization to the new account-bound wallets.
- [ ] Fund the buyer with Sepolia test ETH and test USDC.
- [ ] Build and confirm test-USDC shielding with reviewed approval, amount and fees.
- [ ] Confirm the new account's shielded balance is spendable before enabling payment.
- [ ] Restore and resynchronize a wallet after shielding.

## Merchant payment

- [ ] Create a merchant invoice with private recipient, amount, token, chain, expiry and unique ID.
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
key custody/recovery, remote hosting and any unbuilt sponsor features are outside
this first controlled test. Sponsor eligibility must match demonstrated features.

The local demo runtime handles decrypted wallet keys and recovery passwords.
Current checkout payments are public test transfers. Neither local wallet setup
nor a valid local proof establishes a settled private merchant payment.
