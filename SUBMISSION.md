# Honeybee Pay submission text

Updated September 13, 2026. Ready to copy into the matching portal fields, subject
to its field limits. No form has been submitted. This version accurately describes
the evidence available before the first funded private payment. If that payment
passes, update the status using its actual buyer and merchant evidence.

## Short description

Email-based stablecoin checkout with clear payment approvals and a local ZK payment prototype.

## Project description

Honeybee Pay makes stablecoin payments easier to review and harder to redirect.
A buyer signs in by email, uses an embedded Ethereum wallet, reviews the recipient
and amount, and receives a retrievable receipt after Honeybee verifies the matching
transfer. The public testnet checkout has completed a 1-test-USDC payment on
Ethereum Sepolia.

The local privacy prototype adds separate buyer and merchant RAILGUN wallets,
encrypted recovery, merchant payment requests, shield-deposit tools and private
payment confirmation. Merchant payments remain in Circle test USDC; broadcaster
fees use separately funded Sepolia WETH. The proof adapter binds both transfers
to one RelayAdapt batch so the original fee proof cannot be submitted on its own.

Two actual Groth16 proofs using synthetic notes passed local verification and the
deployed Sepolia verifier, including rejection of a modified batch binding. The
Windows runtime has discovered a compatible broadcaster and verified the fee-token
contract. The funded Windows attempt generated proofs and passed local runtime Sepolia
checks, but broadcaster delivery returned an error and settlement remains unknown.
A compatible recovery using the same original inputs is implemented and tested;
a confirmed private payment and matching merchant receipt remain unverified. The hosted demo shows public transfers; the newer private
features run locally and are demonstrated separately.

## How it is made

React provides the checkout. Privy supplies email authentication, embedded Ethereum
wallets and user-confirmed public wallet actions. viem prepares public transactions
and verifies receipts. A hosted Worker checks public payment evidence before
recording shared test activity.

The local Node runtime verifies Privy account tokens and isolates account-bound
RAILGUN wallet workers. Password-protected backups preserve wallet recovery;
encrypted request history can be restored separately. RAILGUN wallet/engine SDKs
and snarkjs supply the privacy protocol and proving machinery. Honeybee adds
reviewed payment terms, exact approvals, bounded fee consent, proof-batch binding,
before-send attempt storage and original-transaction reconciliation.

The original Solidity approval-recording exercise is separate from the checkout.
It neither moves tokens nor enforces this payment flow. Honeybee's approval checks
are application controls, not an independently enforced onchain firewall.

## Challenges

The Windows hotspot initially reset POI connections; preferring IPv4 restored the
service check. Broadcasters advertised Sepolia fees but none accepted Circle test
USDC. The solution keeps the merchant token unchanged and uses verified Sepolia
WETH for fees. That introduced a second private proof, requiring explicit batch
binding and receipt checks to prevent a standalone fee submission. Short fee
quotes also exposed unnecessary serial RPC delays and duplicate simulations;
those were reduced while retaining expiry and transaction checks. A further relay
flag mismatch with the reference broadcaster required a compatible proof; recovery
preserves the original authorization, enforces both original spending inputs and
requires fresh explicit consent. Unknown delivery never silently creates a second
payment. Receipt recovery searches for confirmed settlement even when another
authorized delivery is pending or reverted.

## AI assistance and attribution

McLean directed the product, requirements and tradeoffs. Codex assisted with code,
tests, documentation and dependency review. Git history and the build log record
the work. Honeybee integrates RAILGUN, Privy and other existing libraries; it does
not claim to have invented their protocols. Payment authorization is deterministic
code. The demonstration does not claim a live AI exploit, autonomous approval or
an independent security audit.

## Privy: Best financial flow explanation

Privy is central to Honeybee's working public checkout: email sign-in creates or
reopens an embedded Ethereum wallet, and a Privy wallet action confirms the reviewed
Sepolia test-USDC transfer. Users can revisit a receipt without manually setting up
a separate wallet extension. The local private prototype uses that public wallet
for explicit test-funding confirmations and verified account identity for the
local wallet service. The private RAILGUN wallet has its own encrypted recovery;
email sign-in alone does not recover it.

## Prize selection

The strongest supported target is **Privy — Best financial flow**: demonstrate the
functional Privy wallet transfer, source and UX. The B2B prize additionally requires
a Privy control such as policies, signers, key quorums or intents; Honeybee's own
checks do not satisfy that requirement. Do not claim B2B eligibility on that basis.
Arc, Chainlink CRE and The Graph integrations have not been demonstrated. Multiple
prize selection is allowed by the user's form, but it does not replace eligibility.
Requirements rechecked September 13 against the [official prize page](https://ethglobal.com/events/ethonline2026/prizes).

## Links and remaining portal fields

- [Repository](https://github.com/mcleanlipschutz/honeybee-pay)
- [Current implementation branch](https://github.com/mcleanlipschutz/honeybee-pay/tree/codex/privacy-segment-1a)
- [Draft development PR](https://github.com/mcleanlipschutz/honeybee-pay/pull/1)
- [Public checkout demo](https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site)
- [Current checkpoint](privacy/reports/final-handoff-validation.json)
- [ZK proof evidence](privacy/reports/separate-fee-validation.json)
- [Recording script](DEMO_SCRIPT.md) and [remaining steps](FINAL_HOURS.md)

The Site's access configuration was rechecked: public, active, published version 3.
It serves the public checkout; it does not host the local private wallet service.
The latest code is on the linked branch, which must be made clear to judges.

User actions still required: supply the recorded video URL and actual screenshots;
check exact deadline, duration/field limits and judging availability in the signed-in
portal; review and submit. No video or submission confirmation exists yet. Do not
mark a request paid without a confirmed matching private receipt. KYC, commercial
fees and real-money release remain deferred.
