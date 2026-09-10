# Honeybee Pay
Honeybee Pay is an ETHGlobal hackathon project that aims to simplify crypto payments with AI, protect transaction details using zero-knowledge proofs, and block payments that don’t match the user’s approved rules.

The [product direction](PRODUCT_DIRECTION.md) is an app or website where users
create their profile and wallet and pay merchants from a shielded balance. KYC
is deferred until after testing and a review of the time before submission; it
may wait until after the contest. See the [first-test checklist](TEST_CHECKLIST.md).
The current checkout still uses public test transfers.

## The problem

Crypto is often treated as a trading asset, while everyday payments remain a limited use case in the United States. Paying with crypto can be confusing for ordinary users, and transactions on public blockchains can expose payment amounts and wallet activity. Scams and unauthorized transactions create additional risks, including when AI tools are used to deceive users or manipulate payment instructions. Honeybee Pay aims to address these barriers by making payments easier, protecting transaction privacy, and enforcing the user’s approved payment terms.

## Planned attack-comparison demo

- The buyer approves three separate transactions of 1 test USDC to send to the merchant wallet.

- Transaction 1 succeeds normally. Transaction 2 is redirected to the attacker's wallet in an intentionally unprotected demo. Transaction 3 encounters the same redirection attempt, which is rejected because the recipient differs from the buyer's approval.

- The planned AI-assisted explanation tells the buyer that the recipient changed and the transaction was blocked; this explanation is not the authorization control.
 
- This comparison remains to be run. It will demonstrate payment-rule behavior separately from the complete private-payment test. The existing approval checks are application controls, not an independently enforced onchain firewall.

## Current status

Updated September 10, 2026, through **Segment 1X** on
`codex/privacy-segment-1a`. The development work remains in
[draft PR #1](https://github.com/mcleanlipschutz/honeybee-pay/pull/1).

**A public test payment has been verified. A complete private merchant payment
has not yet settled.** The hosted mobile demo provides public Sepolia checkout,
receipt history and a shared test-payment counter through Segment 1O. The newer
private-wallet features run on a trusted local computer and have not been
published to the hosted demo.

### Completed implementation and recorded validation

| Area | Work completed | Validation and remaining limits |
| --- | --- | --- |
| Mobile login and public checkout | Privy email login, embedded buyer/merchant wallets, reviewed test-USDC transfers and matching receipt verification. | Mobile wallet persistence and one user-signed 1-USDC Sepolia payment verified. [Recorded evidence](checkout/reports/segment-1n-validation.json). |
| Public receipts and usage counter | Sent/received receipt history and downloads; server-verified shared counter with durable transaction uniqueness. | Receipt reader found the matching payment for both accounts; automated counter checks passed. Phone receipt downloads and counter behavior still need manual validation. |
| ZK proof and demo-wallet synchronization | Real local RAILGUN proof, tamper rejection, persistent recovery, deployment identity checks and disposable-wallet history scans. | Proof uses synthetic notes. Read-only demo scans passed; this does not establish a funded or spendable account wallet. [1E](privacy/SEGMENT-1E.md), [1F](privacy/SEGMENT-1F.md), [1J](privacy/SEGMENT-1J.md). |
| Account-bound private wallets | Authenticated local wallet creation/recovery, separate account roots, encrypted wallet backups and browser setup UI. | Real SDK/API isolation and recovery checks passed. Actual local browser recovery remains pending. [1K](privacy/SEGMENT-1K.md), [1L](privacy/SEGMENT-1L.md). |
| Private deposit preparation | Account history/balance integration, deposit review, fee simulation, bounded gas quotes, submission controller, attempt journal and canonical deposit verifier. | Controlled tests passed. Live account sync, funding and spendability remain unverified. Controller is not connected to the UI; signing stays disabled. [1P](privacy/SEGMENT-1P.md), [1Q](privacy/SEGMENT-1Q.md), [1R](privacy/SEGMENT-1R.md), [1S](privacy/SEGMENT-1S.md). |
| Merchant payment requests | Account-derived private recipient, exact amount/network/expiry, request download/import and immutable buyer review. | SDK/API and request validation checks passed. Requests are unsigned and do not authenticate a merchant or authorize payment. [1T](privacy/SEGMENT-1T.md). |
| Encrypted request history and backups | Saved requests, history reopening, separate encrypted history export and merge-only restore. | Restores preserve newer records, skip duplicates and reject conflicts. Actual browser downloads/recovery remain pending. Request history is not a payment receipt or settlement ledger. [1U](privacy/SEGMENT-1U.md), [1V](privacy/SEGMENT-1V.md). |
| Buyer private-funds check | Imported request connected to an authenticated account scan; exact balance/shortfall and an expiring result in local checkout. | Controlled scans and client validation passed; actual workers reject unauthorized requests and wrong-chain preflight. Live funded checks and browser interactions remain pending. Fees are unchecked and payment is not authorized. [1W](privacy/SEGMENT-1W.md). |
| Deposit activity and recovery | Local account-scoped attempt list and read-only reconciliation, including missing-hash recovery for a recorded attempt. | Controlled provider/storage tests passed. Status reads never submit a transaction. Actual browser and live deposit checks remain pending. [1X](privacy/SEGMENT-1X.md). |

### Latest validation

Segment 1X recorded **24 focused tests passed** and a successful checkout
client/Worker build. Tests cover account-scoped activity, exact transaction
reconciliation, missing/late results, read-only RPC use, guarded journal writes
and existing signing-controller/receipt regressions. Provider, storage and wallet
responses in this run are controlled fixtures. See the
[validation report](privacy/reports/segment-1x-validation.json) and
[reproduction command](privacy/SEGMENT-1X.md#validation).

This is the recorded Segment 1X run, not a cumulative test total or a fresh
full-repository run. Actual browser, cross-computer and Windows/power-loss checks
remain pending. Existing build warnings and dependency findings still need
review; no fresh dependency audit is claimed.

Keep **both** the wallet recovery file and separate encrypted request-history
backup. Sign in to the same account, recover the wallet first, then restore its
history. History backup alone cannot recover the wallet or funds.

### Remaining work before the complete private-payment test

1. Verify local Privy sign-in, separate accounts, browser downloads and wallet-then-history recovery on the trusted computer.
2. Validate account synchronization, deposit review and gas simulation against live/forked Sepolia. Integrate the controller, verify browser wallet prompts and obtain explicit user approval before a small test deposit; confirm its canonical event, spendability and recovery.
3. Connect reviewed merchant requests to proof generation, submission and settlement. Verify the exact received amount/recipient from merchant wallet state and handle pending or interrupted attempts without automatic resending.
4. Reconcile each paid invoice once and provide encrypted private receipts to both parties.
5. Verify public receipt downloads and the shared counter on mobile, including reloads and duplicate prevention.
6. Run the full private flow and attack comparison, review dependency/logging blockers, collect evidence and prepare the submission demo.

KYC remains postponed until after testing and a timeline review. Email receipt
notifications and QR/payment links are not implemented; the existing receipt
interface and request-file workflow support the initial demo path. Real-money
release and production hosting of the private-wallet runtime are outside this
controlled testnet milestone.

The [test checklist](TEST_CHECKLIST.md) tracks the individual gates. The
[build log](docs%20/%20BUILD_LOG.md) preserves the implementation history,
including dependency work, transport fixes and the latest status checkpoint.
