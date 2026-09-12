# Honeybee Pay submission draft

Prepared September 11, 2026. Review this against the portal's current fields and
limits before submitting. This file is a draft; no submission has been sent.

## Short description

Simple USDC payments with buyer-approved rules and a developing ZK privacy layer.

## Project description

Honeybee Pay explores a simpler way for everyday users and merchants to exchange
stablecoins while keeping control over what they approve. The working public
prototype uses email login and embedded wallets to send test USDC on Ethereum
Sepolia. It checks the buyer's approved recipient, amount, token and network,
then verifies the matching payment event before issuing a public receipt.

The private-payment work adds account-bound RAILGUN wallets, encrypted recovery,
merchant requests, private-funds checks, and deposit preparation and recovery
tools. Real offline zero-knowledge proof and tamper-rejection checks pass with
synthetic inputs. A complete private merchant payment and encrypted settlement
receipts are still under integration. Public test payments and offline privacy
tests are presented separately so the demo does not overstate what is working.

## How it is made

The checkout uses React, Privy email authentication and embedded Ethereum wallets,
with viem for public token transactions and receipt verification. A hosted Worker
verifies public payment evidence before recording a shared test-payment count.

The private runtime runs on a trusted local computer. Verified account tokens
select isolated RAILGUN wallet workers. Password-protected wallet backups and
encrypted request history support recovery. RAILGUN's wallet/engine SDKs and
snarkjs provide the existing privacy and proving machinery; Honeybee does not
claim to have invented those protocols. Application checks bind reviewed payment
terms, reject changed proposals and keep uncertain deposit outcomes from being
automatically resent. New network readers cap decoded response sizes.

The original Solidity approval-recording exercise is separate from this checkout.
It neither transfers tokens nor enforces the current private-payment flow.
Honeybee's application checks are not an independently enforced onchain firewall.

## AI use and ownership

McLean originated the payment/privacy/fraud-prevention direction and set the
product requirements. Codex assisted with implementation, tests, documentation
and dependency review, with work recorded in Git history and the build log.
The current security decision is deterministic code. The demo does not claim a
live AI agent, real prompt-injection exploit, autonomous payment approval or
independent security certification. McLean should be able to explain the
tradeoffs and demonstrate the evidence himself.

## Prize targets

These are targets, not organizer-confirmed eligibility. Multiple selections do
not make an unbuilt integration qualify.

| Target | Current fit | Work still needed for a credible submission |
| --- | --- | --- |
| Privy: Best financial flow | Strongest demonstrated fit: embedded wallet and recorded public USDC transfer. | Show the working flow and explain the UX improvement; provide demo/source access. |
| Privy: Best B2B financial product | Possible additional target for merchant operations. | Demonstrate a Privy control such as a policy, signer, quorum or intent. Honeybee's own checks are not that control. |
| Arc | Potential future stablecoin integration. | Build a meaningful Arc integration. Sepolia USDC by itself is insufficient. |
| Chainlink: Best Confidential Workflow | Future option, currently unbuilt. | A functional CRE confidential workflow is required; the word privacy is not enough. |
| The Graph | Current RAILGUN history service is not a demonstrated Graph sponsor integration. | Build and show the qualifying live Graph data/tooling integration. |

Source checked September 11: [official sponsor requirements](https://ethglobal.com/events/ethonline2026/prizes).
If the portal lists sponsors, select Privy once; its two prizes are under that
sponsor. Do not represent optional future integrations as completed features.

## Submission package

- Repository: https://github.com/mcleanlipschutz/honeybee-pay
- Reviewed development: https://github.com/mcleanlipschutz/honeybee-pay/pull/1
- Current status and tests: README.md and privacy/reports/segment-1z-validation.json
- Presentation steps: DEMO_RUNBOOK.md
- Security boundaries and residual risks: SECURITY_REVIEW.md
- Check-in text: CHECK_IN_2.md

Point judges to the actual draft branch if main has not been updated. Verify that
the source and hosted demo are accessible to them before submitting. The hosted
demo remains the public implementation through Segment 1O; later private work
is local only. Do not promise judges a private-payment button on the hosted site.

## Details requiring the organizer portal

The public prize page was readable, but the event overview returned errors and
the schedule could not be verified. The exact submission deadline, its timezone,
live-judging time and video limit therefore remain unconfirmed. Do not reuse an
old deadline estimate. Check the signed-in dashboard and organizer notices.
Choose live judging only after checking personal availability. KYC and the
commercial fee idea remain deferred; this draft makes no real-money launch claim.
