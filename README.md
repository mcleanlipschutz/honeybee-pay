# Honeybee Pay
Honeybee Pay is an ETHGlobal hackathon project that aims to simplify crypto payments with AI, protect transaction details using zero-knowledge proofs, and block payments that don’t match the user’s approved rules.

The [product direction](PRODUCT_DIRECTION.md) is an app or website where users
create their profile and wallet and pay merchants from a shielded balance. KYC
is deferred until after testing and a review of the time before submission; it
may wait until after the contest. See the [first-test checklist](TEST_CHECKLIST.md).
The hosted checkout uses public test transfers. The newer local private-payment
flow is described in [ZK_FLOW.md](ZK_FLOW.md); funded end-to-end validation remains pending.
Start with [remaining steps](FINAL_HOURS.md), [submission text](SUBMISSION.md), and
the [demo script](DEMO_SCRIPT.md).

## The problem

Crypto is often treated as a trading asset, while everyday payments remain a limited use case in the United States. Paying with crypto can be confusing for ordinary users, and transactions on public blockchains can expose payment amounts and wallet activity. Scams and unauthorized transactions create additional risks, including when AI tools are used to deceive users or manipulate payment instructions. Honeybee Pay aims to address these barriers by making payments easier, protecting transaction privacy, and enforcing the user’s approved payment terms.

## Attack-comparison demo

- The completed offline demonstration uses one fixed test invoice and three separately labeled cases.

- Case 1 prepares the approved request using SDK doubles. Case 2 accepts a changed recipient in an intentionally unprotected fixture. Case 3 applies the actual approval adapter and rejects the same change before proof preparation. None of these cases sends a transaction.

- The planned AI-assisted explanation tells the buyer that the recipient changed and the transaction was blocked; this explanation is not the authorization control.
 
- The offline comparison now runs with `npm run demo:rules` in `privacy/`: approved preparation, an unprotected recipient-change fixture, and rejection by the real approval adapter using SDK doubles. It moves no tokens and is separate from the complete private-payment test. The approval checks are application controls, not an independently enforced onchain firewall.

## Current status

Updated September 13, 2026, through the **private-payment integration** and Windows follow-ups on
`codex/privacy-segment-1a`. The development work remains in
[draft PR #1](https://github.com/mcleanlipschutz/honeybee-pay/pull/1).

**A public test payment has been verified. A complete private merchant payment
has not yet settled.** The hosted mobile demo provides public Sepolia checkout,
receipt history and a shared test-payment counter through Segment 1O. The newer
private-wallet features run on a trusted local computer and have not been
published to the hosted demo.

**Submission handoff:** see [FINAL_HOURS.md](FINAL_HOURS.md) for the short demo
script and deadline checklist, and [SUBMISSION.md](SUBMISSION.md) for portal text.
Earlier time estimates are historical; use the organizer portal for the
current deadline and video limit. The hosted Site was made public with McLean's
authorization, and he confirmed that its homepage opens. It remains the public
payment build; the private-wallet runtime has not been hosted.

Windows now passed the POI availability check with IPv4 preferred after default
and TLS-1.2-only attempts reset on the cellular hotspot. Normal private-runtime
launchers and isolated wallet workers now carry that address preference. A live
disposable unfunded account scan and recovery passed after correcting worker
shutdown and account leases. Funded private settlement remains unverified.

**Current ZK handoff:** [ZK_FLOW.md](ZK_FLOW.md) contains the update commands,
read-only broadcaster check, small deposit steps, private-payment confirmation
and merchant receipt check. The Windows laptop has now found a compatible
WETH broadcaster and verified the fee-token contract. Funding review and simulation
have been shown, but no wrap, approval, shield or private-payment confirmation has
yet been supplied. The fee-expiry follow-up reduces RPC delay without extending
freshness limits and preserves original-transaction controls after expiry.

### Completed implementation and recorded validation

| Area | Work completed | Validation and remaining limits |
| --- | --- | --- |
| Mobile login and public checkout | Privy email login, embedded buyer/merchant wallets, reviewed test-USDC transfers and matching receipt verification. | Mobile wallet persistence and one user-signed 1-USDC Sepolia payment verified. [Recorded evidence](checkout/reports/segment-1n-validation.json). |
| Public receipts and usage counter | Sent/received receipt history and downloads; server-verified shared counter with durable transaction uniqueness. | Receipt reader found the matching payment for both accounts; automated counter checks passed. Phone receipt downloads and counter behavior still need manual validation. |
| ZK proof and demo-wallet synchronization | Real local RAILGUN proof, tamper rejection, persistent recovery, deployment identity checks and disposable-wallet history scans. | Proof uses synthetic notes. Read-only demo scans passed; this does not establish a funded or spendable account wallet. [1E](privacy/SEGMENT-1E.md), [1F](privacy/SEGMENT-1F.md), [1J](privacy/SEGMENT-1J.md). |
| Account-bound private wallets | Authenticated local wallet creation/recovery, separate account roots, encrypted wallet backups and browser setup UI. | Real SDK/API isolation and recovery checks passed. McLean confirmed separate buyer/merchant browser backups and recovery, including matching wallet addresses. [1K](privacy/SEGMENT-1K.md), [1L](privacy/SEGMENT-1L.md). |
| Private deposit confirmation | Local UI connects reviewed amounts, fresh simulation, exact allowance/deposit wallet confirmation, attempt journal and canonical deposit verification. | Controlled signing/receipt checks passed; actual browser wallet confirmation and funded spendability remain pending. [Current steps](ZK_FLOW.md). |
| Merchant payment requests | Account-derived private recipient, exact amount/network/expiry, request download/import and immutable buyer review. | SDK/API and request validation checks passed. Requests are unsigned and do not authenticate a merchant or authorize payment. [1T](privacy/SEGMENT-1T.md). |
| Encrypted request history and backups | Saved requests, history reopening, separate encrypted history export and merge-only restore. | Restores preserve newer records, skip duplicates and reject conflicts. McLean reported merchant history recovery and request import with matching terms. Request history is not a payment receipt or settlement ledger. [1U](privacy/SEGMENT-1U.md), [1V](privacy/SEGMENT-1V.md). |
| Buyer private-funds check | Imported request connected to an authenticated account scan; exact balance/shortfall and an expiring result in local checkout. | Controlled scans and client validation passed; actual workers reject unauthorized requests and wrong-chain preflight. Live funded checks and browser interactions remain pending. Fees are unchecked and payment is not authorized. [1W](privacy/SEGMENT-1W.md). |
| Deposit activity and recovery | Local account-scoped attempt list and read-only reconciliation, including missing-hash recovery for a recorded attempt. | Controlled provider/storage tests passed. Status reads never submit a transaction. Actual browser and live deposit checks remain pending. [1X](privacy/SEGMENT-1X.md). |
| Private merchant payment | Fee quote, explicit buyer confirmation, actual transfer/POI prover, onchain proof check, Waku broadcaster and encrypted attempt journal. | Two real synthetic 01x02 proofs, bound to the same relay batch, passed local and deployed verification; separate-fee integration tests passed. No funded private transfer yet. [Evidence and limits](ZK_FLOW.md). |
| Private receipts | Original-nullifier recovery, exact calldata/events, outgoing POI refresh and merchant-decrypted request memo matching. | Controlled wrong-hash, lost-response, reverted-authorization and merchant-matching checks pass. Live sender/merchant recognition remains pending. |
| Dependency security update | Same-major networking/parser pins; wallet and prover SDK versions preserved. | Fresh production audits: no high/critical findings; 5 low private-runtime and 23 moderate checkout findings remain. Offline wallet/proof compatibility passed. [1Y](privacy/SEGMENT-1Y.md). |

### Latest validation

Current fee-expiry follow-up: **40 checkout tests**, 21 focused deployment/funding/preflight tests and
10 account-sync/POI tests passed; production client/server build passed.
The [handoff report](privacy/reports/final-handoff-validation.json) records the final
scope. The earlier separate-fee release passed 43 focused private tests plus four
balance/sync tests, and two actual synthetic Groth16 proofs passed local and deployed
Sepolia verification. See [proof evidence](privacy/reports/separate-fee-validation.json)
and [ZK_FLOW.md](ZK_FLOW.md) for trust limits. These are not funded settlement tests.

September 13: nine focused account-sync/POI tests, the offline rules demo and a
fresh real synthetic-input proof/tamper check passed. The Windows IPv4-preferred
POI success and remaining scan/access limits are recorded in the
[submission checkpoint](privacy/reports/submission-checkpoint.json).

Segment 1Z recorded **132 private-runtime tests and 38 checkout tests passed**,
plus 23 focused checks after refining response-size limits and a successful
offline three-case approval comparison. The JavaScript suites use controlled
network responses and disposable wallets. See the
[validation report](privacy/reports/segment-1z-validation.json) and
[reproduction commands](privacy/SEGMENT-1Z.md#validation).

The successful client/Worker build and real offline wallet/recovery and synthetic
proof checks remain recorded in Segment 1Y. They were not rerun in 1Z. New RPC,
history and POI response readers count decoded streaming bytes, cancel oversized
replies and retain bounded buffers. No frontend or cryptographic source changed.

Fresh production-dependency audits improved from 28 to 5 private-runtime
findings and from 25 to 23 checkout findings, with no high or critical findings
remaining. This is not a complete security approval: elliptic, uuid and URI
decoding findings, existing peer mismatches and build warnings remain documented.
Actual browser, live funded-account, cross-computer and Windows/power-loss checks
remain pending. No new Solidity/full-repository test run is claimed.

Keep **both** the wallet recovery file and separate encrypted request-history
backup. Sign in to the same account, recover the wallet first, then restore its
history. History backup alone cannot recover the wallet or funds.

### Remaining work before the complete private-payment test

1. Complete the remaining browser checks for account changes and password clearing; basic separate-account sign-in, downloads and wallet/history recovery have been user-confirmed.
2. Verify laptop broadcaster access and actual browser wallet prompts, then explicitly confirm a small test deposit and check its canonical event and spendability.
3. Exercise the implemented merchant-request, real-proof and broadcaster path against funded Sepolia; check the original transaction and outgoing POI completion.
4. Verify the merchant's matching decrypted amount/request receipt, plus reload and wallet recovery after that actual transfer. Do not clear an unresolved payment journal.
5. Verify public receipt downloads and the shared counter on mobile, including reloads and duplicate prevention.
6. Run the full private flow and attack comparison, review dependency/logging blockers, collect evidence and prepare the submission demo.

KYC remains postponed until after testing and a timeline review. Email receipt
notifications and QR/payment links are not implemented; the existing receipt
interface and request-file workflow support the initial demo path. Real-money
release and production hosting of the private-wallet runtime are outside this
controlled testnet milestone.

The [test checklist](TEST_CHECKLIST.md) tracks the individual gates. The
[demo and computer runbook](DEMO_RUNBOOK.md), [submission draft](SUBMISSION.md),
[Check-in 2 draft](CHECK_IN_2.md) and [security review](SECURITY_REVIEW.md)
prepare the next session. The exact deadline and live-judging time still need
confirmation in the organizer dashboard. The
[build log](docs/BUILD_LOG.md) preserves the implementation history,
including dependency work, transport fixes and the latest status checkpoint.
