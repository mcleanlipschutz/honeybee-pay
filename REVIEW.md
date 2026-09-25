# Honeybee Pay — Segment 1A review

## Decision requested
Approve adding only this privacy/ directory and this review guide on a new branch,
then opening a draft pull request. No merge, deployment, transaction broadcasting,
wallet funding, or mainnet operation is included. The existing Solidity prototype
is unchanged. No GitHub changes have been made in preparing this package.

## What you are reviewing
An application adapter for RAILGUN private ERC-20 transfers, with dependency-free
unit tests. This is the first slice of the privacy feasibility investigation,
NOT the completed feasibility demonstration or a working private payment app.

Honeybee Pay's priority is cash-like private payments and merchant-friendly
checkout. AI and payment-rule protection are supporting features. The proposed
flow keeps the merchant's receipt inside the shielded system. It does not add a
public stealth-address withdrawal or a 30-minute escrow.

## Read in this order
1. privacy/src/private-transfer.mjs: invoice validation, exact amounts, proof
   request, and transaction preparation.
2. privacy/test/private-transfer.test.mjs: scenarios checking this adapter.
3. privacy/src/railgun-loader.mjs: optional connection to real SDK exports.

## In simple terms
- snapshotInvoice copies the buyer-reviewed payment fields so later edits do not
  silently alter the proof request. This is NOT a cryptographic buyer signature.
- parseUSDC converts text such as 3.10 into exactly 3100000 base units without
  floating-point rounding. Use only with an independently verified six-decimal
  token; it does not authenticate the token address or its symbol.
- prepare rejects altered payment fields and locally expired invoices.
- generateTransferProof asks RAILGUN to create its actual spending proof. We do
  not implement our own proof system or invent a successful verification result.
- populateProvedTransfer creates transaction data from that proof. The adapter
  reports prepared-not-paid. Only later verified settlement can mean paid.
- No memo is supplied, the sender-address disclosure flag is false, and public
  wallet submission is false. These settings alone do not guarantee anonymity.
- The adapter never sends the populated transaction.

## Validation performed
Node v24.19.0: 16 unit tests passed, 0 failed.
Verified generateTransferProof and populateProvedTransfer argument order against
@railgun-community/wallet 10.9.0's published .d.ts files, downloaded from npm.
The real SDK has NOT been installed or executed by this test package.
The tests use explicit SDK doubles and fake wallet/address/fee fixtures. They do
not establish cryptographic correctness, private-address validity, valid gas
quotes, proof availability, spent-note protection, or a settled private payment.

Tests cover amount parsing, changes to all six invoice fields, expiry equality,
expiry during proving, rejected public recipients, propagation of proof failures,
privacy flags, immutable request snapshots, and concurrent-request rejection.

## Run the review tests
With Node 22 or later, from the repository root after adding the files:

    cd privacy
    npm test

No npm install, private key, RPC URL, wallet, or funds are needed for these tests.
An error from railgun-loader about missing packages is expected until the real
integration is implemented. It is not used by npm test.

## What must be established next
1. Select a genuinely supported local/fork/test environment. Do not assume that
   arbitrary Anvil, Sepolia, or Arc deployments work with the SDK. No supported
   environment has yet been demonstrated for this project.
2. Pin/install compatible wallet, shared-models, engine, and prover dependencies
   with a lockfile. 10.9.0 is the API version inspected, not a security endorsement.
3. Initialize artifact storage, encrypted wallet database, prover, RPC provider,
   wallet synchronization and any required proof-of-innocence services/policies.
4. Create test buyer and merchant wallets and funded private notes using test-only
   assets. Save recovery material privately, outside the repository and logs.
5. Validate token chain/address/decimals and private recipient with the SDK. The
   current 0zk prefix check is deliberately NOT full address validation.
6. Obtain and validate a broadcaster fee quote and chain-specific gas details,
   show total cost to the buyer, and bind fees to the final approval. The adapter
   currently treats the quote as trusted integration input, not verified data.
7. Generate a REAL proof, verify through the real verifier and settle locally or
   on the approved test environment. Confirm buyer debit, merchant credit, fees,
   and attempted double-spend rejection. No mock verifier in this integration.
8. Inspect public calldata, logs and the caller identity. Test wrong recipient,
   altered proof, wrong network/root and replay. Audit what entry/exit and timing
   expose. A small demo cannot prove strong real-world anonymity.
9. Give the merchant a confirmed receipt only after protocol finality/sync checks.
10. Decide independent authorization enforcement. JavaScript checks can be bypassed
    by an attacker controlling the signer/engine. Keep AI away from spending keys.
    Invoice authentication, user authorization, cancellation, and onchain expiry
    enforcement are NOT implemented in this segment.

## Important boundaries for review
- This does not hide values by merely hashing a public transfer.
- The public HoneybeePay.sol approvals must not receive private invoice details.
- The SDK handles internal notes; this package does not create a new wallet per sale.
- Repeated preparation is possible; no claim of application-level replay prevention.
- The in-memory lock covers one adapter instance only. The real integration must
  own engine access and prevent competing sessions from overwriting proof state.
- Anyone holding both invoice objects can substitute both. They must originate
  from an authenticated invoice and independent buyer confirmation in later work.
- Amounts, addresses, keys and notes must not be passed to an external AI service
  by default. Receipts should remain under participant control.

## Sources and attribution
AI-assisted code and tests prepared by ChatGPT/Codex for McLean's manual review.
No code has been represented as handwritten by the project owner. Call signatures
follow these official RAILGUN references:

- https://docs.railgun.org/developer-guide
- https://docs.railgun.org/developer-guide/wallet/transactions/private-transfers/private-erc-20-transfers
- https://docs.railgun.org/developer-guide/wallet/transactions/ux-private-transactions
- https://www.npmjs.com/package/@railgun-community/wallet/v/10.9.0
- https://github.com/Railgun-Community/wallet

The inspected upstream wallet package is MIT licensed. This package's new project
code follows Honeybee Pay's MIT license. Future bundled third-party dependencies
must retain their own licenses and notices.
