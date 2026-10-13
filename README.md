# Honeybee Pay

Honeybee Pay is an ETHGlobal hackathon project exploring easier crypto payments, buyer-approved payment rules, AI assistance, and transaction privacy through zero-knowledge proofs.

## Current status

**Replit development update — October 12, 2026:** Following import of the existing project on October 9, Replit work added preview support, payment-safety infrastructure and tests, and offline Midnight proof preparation. These changes were **not deployed to the live website**. Preview payment sending remains disabled, and genuine ZK proof generation and cryptographic verification remain incomplete.

The existing mobile wallet, frontend, Worker backend, Privy login, and separate privacy/Midnight modules predate this Replit work. They were preserved rather than rebuilt.

### Repository scope

This GitHub repository currently contains the earlier Solidity approval-recording prototype, Foundry starter files, and project documentation. **The Replit application and the test suites described below have not been synced into this repository.** This documentation update records the project owner's supplied Replit progress report; it does not establish that those tests can be run from this checkout.

See [Completed Replit updates and remaining limits](REPLIT_UPDATES.md) for the full report.

## Reported Replit progress

- Configured the development preview while preserving the Wallet, Pay, Request, and Activity screens and existing authentication.
- Confirmed standalone Safari login, wallet balance, and Activity through owner testing after the preview origin was allowed in Privy.
- Added a preview bridge for Worker handlers, explicit sending-disabled status, and checks that stop payment flows before signing when tracking is unavailable or malformed.
- Implemented and tested an isolated, fixture-only cross-device payment-attempt registry with unresolved-attempt locks, single-use signing permits, and recovery without automatic resending.
- Added disposable database integration tests and fixed a race condition in conflicting payment-hash reports.
- Tested startup and read-only tracking status using the actual emitted Worker bundle with outbound network access blocked.
- Prepared an SDK unproven approval transaction and guarded offline Midnight proof infrastructure. **All 34 Midnight tests reportedly passed; no genuine proof was generated or independently verified.**

## Safety boundaries and unfinished work

Preview access does not authorize payments or retries. The registry has no live database connection or real account-to-wallet ownership verification and is not enabled for actual sending. Original uncertain payments remain unresolved; their journals must not be cleared or used to justify resending.

Live deployment, a final hosting decision, persistent preview storage, genuine ZK proving and verification, Midnight test deployment, private settlement, and full browser-based proof backup/recovery remain unfinished. Real proving remains blocked under the owner's phone-only instruction.

No wallet secrets were imported, no funds were moved, no uncertain payment was resent, and no original payment journal was cleared during the reported Replit work.

## The problem

Crypto payments can be difficult to use and can expose amounts and wallet activity on public blockchains. Scams, unauthorized transactions, and manipulated payment instructions create additional risks. Honeybee Pay aims to make payments easier while enforcing the buyer's approved recipient, token, amount, and authorization rules. AI assistance must not override those rules.

## Original demonstration plan

The original design uses three separately approved payments of 1 test USDC:

1. A normal payment to the approved merchant.
2. A redirected payment in a deliberately unprotected, separate comparison.
3. The same redirection rejected by the protected flow because the recipient differs from the buyer's approval.

An AI-generated explanation is intended to tell the buyer why the altered payment was blocked. This is the original demonstration plan, **not a claim that funded payment tests or the complete demo have been verified**. ZK privacy is a separate development milestone.

The existing prototype records approvals; it should not be treated as a production payment system.
