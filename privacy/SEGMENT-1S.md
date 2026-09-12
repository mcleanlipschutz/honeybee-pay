# Segment 1S: deposit transaction handling

The next submission controller, persistent attempt journal and read-only receipt
verifier are implemented. **They are not connected to the local or hosted UI.**
The default signing gate always rejects; tests supply an explicit fake gate and
fake wallet. No environment variable or runtime flag enables private deposits.
No transaction was signed or broadcast during this segment.

Live Sepolia/fork validation is still blocked by this workspace's network policy.
The blocked RPC route was not retried or bypassed. This segment completes the
transaction-handling code that can be verified here; it does not satisfy that
live gate or claim a completed ZK payment.

## Wallet request and attempt lifecycle

The controller validates the original account-bound review and retained fee
quote. A confirmation call names the exact quote ID. It checks the current login,
funding wallet, provider accounts, Sepolia chain, pending nonce and quote expiry.
It persists the intent before entering the wallet prompt and rechecks identity,
network, nonce and expiry immediately before calling the wallet.

The wallet request carries the original calldata, exact amount/target, nonce,
zero native value, EIP-1559 gas limit and fee caps. Sponsorship is off and Privy's
wallet confirmation UI is requested. The current installed Privy types support
these fields; the sending interface was checked against its [official React
documentation](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction).
The code does not switch networks and send in the same action.

Approval and deposit require separate confirmation calls. An approval confirmation
does not automatically obtain a new quote or send a deposit. The next deposit
requires a fresh preflight and uses the original randomized shield calldata.

Before the wallet prompt, an attempt is recorded as `awaiting-wallet`. A valid
returned hash changes it to `pending`, even if sign-out or expiry happened while
the wallet was open. An explicit wallet rejection records `rejected` and consumes
that quote; another attempt needs a fresh quote. Timeouts, malformed responses
and ambiguous errors remain `unknown`. Missing transactions never establish
failure, and no path automatically retries or follows a replacement transaction.

If storing a returned hash fails, the controller still exposes it in its outcome
and leaves the earlier persisted attempt blocking another send. Reconciliation
can start from the public intent after reload and after the private review has
expired. A manually supplied hash must match the exact sender, nonce, calldata,
chain and fee bounds; an unknown hash is not adopted merely because it was entered.

## Persistence and limits

The browser adapter uses localStorage under a hash of the authenticated account
ID, with Web Locks to serialize tabs for that account. It retains a bounded history
of up to 128 attempts and rejects new attempts when an unresolved record exists,
the quote was consumed, or the same deposit step was already completed. Completed
records are not automatically removed, so their duplicate protection survives a
reload. Corrupt storage, missing Web Locks or quota failure stops signing.

Only public transaction data, amount/fee terms, correlation digests, hashes and
verification results are stored. No email, raw account ID, private address,
private wallet ID, access token, password or private key is included. These
records can reveal planned deposit metadata to other scripts on the same origin;
their checksum detects accidental changes, not a malicious same-origin script.

Persistence and locking protect one browser profile and origin. Clearing browser
data, switching devices or changing origins can remove that protection. Storage
loss must never be interpreted as proof that a transaction failed. Cross-device
tracking, operator-independent authorization and automated replacement recovery
remain unbuilt. Actual browser Web Locks/storage behavior has not been tested here.

The review/quote expiry is checked before the wallet call. It cannot cancel a
wallet prompt already open or impose a deadline on the existing shield contract.
Late hashes must be reconciled. Fee changes or proxy changes during a prompt are
residual external-protocol risks, not controls independently enforced by this UI.

## Transaction verification

The verifier performs only read requests. It checks chain, sender, destination,
input, nonce, transaction type, gas and fee fields against the persisted intent.
The transaction, receipt and selected event must agree on hash, block, position
and sender. Removed or duplicate matching events, noncanonical encodings, changed
metadata and mismatched amount/fee/note/ciphertext are rejected.

Approval requires two canonical confirmations and its exact USDC Approval event.
The subsequent preflight must observe sufficient allowance again. Waiting for
approval finalization would exceed the original five-minute review, so finalization
is reserved for the deposit. Approval can still reorganize before finalization;
fresh allowance checking and simulation are mandatory.

A deposit requires a finalized canonical block and a matching Shield event from
the pinned proxy. The event must contain exactly the original note public key,
token, ciphertext and shield key, with the reviewed net credit and fee. Its schema
and encoded event are compared against Engine 9.6.0's installed V2.1 ABI. Canonical
block data is checked again after event verification. These are RPC observations,
not an independent light-client proof of Ethereum finality.

The result is `deposit-confirmed`, not a spendable balance or merchant payment.
Account-bound private synchronization and POI/spendability checks remain separate.
Neither an approval nor deposit creates a merchant receipt or increments the
public payment count. Existing public receipts and counter behavior are unchanged.

## Validation

32 focused tests passed: 12 new controller/journal/receipt tests, one independent
Engine event-ABI check, 15 existing review/preflight/SDK tests and four account-client
regressions. These cover separate approval/deposit actions, preserved calldata,
concurrent controllers, reloads, rejection, nonce changes, expired quotes, late
hashes, storage failures, altered events, reorgs and read-only recovery. Existing
gas checks include 1,000 bounded rounding samples; real SDK recovery checks still
pass. Wallet submissions and chain responses in these tests are controlled doubles.

The checkout client and Worker build passed, with existing bundle-size and
transitive worker warnings. The new controller is intentionally absent from the
UI bundle. No full repository suite, browser interaction, live preflight, real
signing, live event confirmation, spendable balance or dependency audit is claimed.
Dependency versions, Solidity contracts and the hosted deployment are unchanged.

## Next live gate on the trusted local computer

1. Follow the existing [local setup](SEGMENT-1L.md), including the exact Privy
   loopback origin, local environment configuration, artifacts and encrypted backup.
   Build `checkout/`, then run `npm run wallet:web` from `privacy/`.
2. Sign in locally, verify the saved recovery copy and sync the account's private
   history. Review a test deposit, then choose **Check network fee**. Record the
   exact chain/block, amount, fee and approval/deposit stage without recording
   passwords, tokens, private wallet addresses or secret material.
3. Validate the full deposit path on a Sepolia fork and the live read-only
   preflight. If allowance is needed, its approval quote alone is insufficient
   evidence that the shield transaction succeeds; a controlled fork must also
   execute approval then the unchanged deposit and verify its event.
4. After that evidence is reviewed, wire this controller into the local UI with
   the actual authenticated journal scope, separate network/approval/deposit
   actions and status recovery. Verify actual browser persistence and Privy
   cancellation/account-change behavior before opening the signing gate.
5. The user explicitly confirms the small test approval/deposit. Verify the
   canonical deposit, resync until spendable and test recovery after restart.

The trusted local key-handling runtime remains local. The accepted CROPS limits
from Segment 1Q still apply, with browser metadata retention added here. Source
remains in the existing MIT repository; independent exit and production custody
are incomplete. KYC remains deferred.
