# Segment 1R: deposit simulation and network-fee preview

The local deposit review now offers **Check network fee**. It simulates the next
required transaction, estimates gas, checks the public wallet's Sepolia ETH and
shows the next wallet-confirmation step. This segment does not enable signing,
submit a transaction, confirm a deposit or establish a spendable private balance.

## Exact review and account binding

The protected account service retains one expiring unsigned review per verified
owner in memory, up to 64 owners. The browser requests a preflight using only the
review ID and its access token; it cannot upload replacement calldata, a wallet
selector, a password, an RPC URL or new payment terms. The existing authentication
and exact-origin HTTP controls remain in force. The cache stores the generated
review only, not access tokens, passwords or wallet keys.

Review expiry, a server restart or a new review requires another deposit review.
Concurrent preflights for the same review are rejected. Cached data is cloned
before use, and a result is discarded if its review was replaced or its account
session expired while the operation ran. The digest identifies a review, but is
not an authorization signature. The trusted server cache establishes which
transaction may be checked for that account.

The isolated fee-check worker receives no recovery password and does not open
the account's wallet database. It reuses deployment/circuit pins and the POI
availability check. Deployment inspection now supports an explicit `latest`
head for this preflight; existing sync and initial review checks still default
to `finalized`. Caller-specified historical heights are not accepted. Proxy,
implementation, relay, pause and verification-key checks are preserved.

## Simulation, fee and confirmation rules

All contract state reads, simulation, gas estimation and balance reads use the
same inspected block number. Its hash must still match after checking, and its
timestamp must be recent. The preflight checks token decimals, pause/blacklist
state, public USDC balance, allowance, protocol fee and expected private credit.
A fee change requires a new review rather than silently changing its terms.

If allowance is insufficient, the preflight simulates and estimates only a
separate USDC approval for the exact deposit amount. It does not pretend that
approval has happened or use state overrides to simulate a funded deposit.
When allowance actually covers the amount, it simulates and estimates the
original shield calldata, including the original randomized note. It never
regenerates the deposit between these stages.

Gas uses integer arithmetic: the estimate receives a 20% buffer, rounded up.
The proposed EIP-1559 max fee is twice the inspected block's base fee plus the
RPC's priority-fee quote. The displayed fee cap is gas limit multiplied by max
fee per gas. Test-only limits reject gas limits above 2,000,000 and max fees
above 50 gwei, and the public wallet must have enough Sepolia ETH to cover this
transaction's cap. These are application quote limits, not onchain controls.
Future signing must carry the exact reviewed gas and fee bounds into the wallet.

Quotes expire within 60 seconds, bounded further by the source block's freshness,
the original review and the login session. The browser checks the quote's digest,
transaction, stage, arithmetic, fee limits, balances and expiry. A funding-account
change discards the response. The UI shows whether the next wallet step would be
switching to Sepolia, approving USDC or confirming the deposit. Approval fees and
deposit fees are explicitly separate. The only active action is the read-only
fee check; no new signing handler or configurable submission flag is added.

## Validation

48 focused tests passed: 7 new preflight/cache/client/worker tests, 10 deployment
checks, 27 account/API/recovery/SDK/RPC regressions and 4 checkout-client tests.
The fee test covers 1,000 bounded gas samples and asserts rounding never
understates the buffered limit or estimated maximum cost. Tests reject changed
fees, paused/blocked tokens, insufficient funds, failed simulations, malformed
gas responses, stale/reorganized blocks, account changes, expired quotes and
replaced or cross-account reviews.

The real worker rejects a local RPC's mainnet response before opening account
storage, without receiving a password. The actual authenticated service rejects
unknown or injected preflight requests before network access. Successful
simulation and gas responses are controlled fixtures; this is not live Sepolia
or fork-test evidence. Existing real SDK note recovery tests still pass.

The checkout client and Worker build passed. Existing bundle-size and transitive
Worker warnings remain. No dependency version changed, new dependency audit,
full-repository test run or browser interaction test is claimed.

## Remaining gate and trust boundaries

Live Sepolia/fork validation remains blocked in this workspace; the blocked
route was not retried or bypassed. On the trusted local test machine, validate
the full preflight against the deployed contracts, then integrate explicit
wallet confirmation with fresh checks and pending/rejected/unknown transaction
handling. Confirm the exact canonical Shield event and rescan for spendability.
Do not automatically resend after a timeout or count a deposit as a merchant
payment. Independent private settlement and recovery after a live deposit remain
separate gates in TEST_CHECKLIST.md.

The Segment 1Q CROPS record still applies: this is a trusted local runtime with
Privy/RPC/POI dependencies, public deposit metadata and incomplete independent
exit. The new cache adds short-lived review data in local process memory, not a
remote database or export of private-wallet secrets. The existing MIT source and
startup instructions remain the rebuild path. No private runtime is published,
no transaction is signed or broadcast, and KYC stays deferred.
