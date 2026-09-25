# Segment 1X: local deposit activity and status recovery

Implemented September 10, 2026. The local wallet screen can now reopen saved
approval/deposit attempts and run the existing canonical receipt checks. This
connects the read-only recovery path; the signing controller remains unconnected
and its default live-validation gate stays closed.

## Local flow

Build checkout, start the existing loopback wallet runtime, and sign in. In the
wallet screen, choose **Open saved attempts** under **Deposit activity**. Records
are scoped to the signed-in account and this browser profile/origin. Opening the
list performs no wallet or chain request and no storage write. It shows five
records at a time, newest first, with a control to show more.

For an unresolved attempt, choose **Check transaction status**. If the browser
did not save a hash, enter the hash from that original wallet attempt. The hash
is checked against the persisted transaction terms before it is adopted; this
is not a general transaction importer. Reconnect the original funding wallet if
it differs from the current wallet. The code never switches networks for you.

Saved status is explicitly historical. The latest successful check is shown
separately. Approval confirmation still needs a fresh deposit preflight; deposit
confirmation still needs a separate private-wallet scan to establish spendability.
Neither is a merchant payment, receipt or public usage-counter increment.

No production attempt is seeded or invented. With signing still disabled, a new
browser normally has an empty list. Empty storage does not prove that no payment
was sent from another browser or before local data was cleared. Missing or pending
transactions remain unresolved; the screen has no resend, delete or reset action.

## Recovery and account boundaries

The recovery controller derives its journal scope from the signed-in account.
It exposes only list and recheck, and its provider adapter allows only chain,
transaction, receipt and block reads. It has no signing or submission capability.
The selected funding wallet must match the recorded sender and remain the same
throughout the check. The existing verifier checks Sepolia, exact calldata, nonce,
fee bounds, canonical events and the required confirmation policy.

Checks are bounded to 30 seconds. Logout, navigation, account/wallet changes and
timeouts discard late reads. A provider request already in progress may finish,
but its result cannot advance the guarded journal update. Reconciliation checks
account state again inside the Web Lock immediately before saving, covering a
logout while an update waits behind another tab. Journal list operations now read
without rewriting or creating records.

The UI receives a small set of validated display fields rather than raw calldata
or arbitrary stored verification objects. Provider errors are replaced with a
fixed message. Corrupt storage is retained and fails closed. Existing terminal
records are not reset; a fresh observation is displayed separately. An unsuccessful
save leaves the prior record in place and the UI reports that verification could
not complete. No path automatically retries.

## Validation

From `checkout/`:

```sh
node --test test/deposit-activity.test.mjs test/shield-submission.test.mjs test/account-client.test.mjs
npm run build
```

**24 focused tests passed:** eight activity tests, twelve existing submission/
journal/receipt tests and four existing account-client tests. Checks cover
reopening, non-writing reads, exact manual-hash reconciliation, unknown and pending
outcomes, wrong accounts/wallets/networks, tampered transactions, error redaction,
late results, timeout, queued-lock account changes and corrupt records. Provider,
wallet and browser-storage behavior is controlled in these tests. No actual
browser interaction, live RPC call or funded deposit was run for this segment.

The client/Worker build passed. Existing large-bundle and Worker externalization
warnings remain. No dependencies changed and no new audit or full-repository
suite was run. No onchain transaction, main merge or hosted deployment occurred.
The hosted mobile site remains through Segment 1O. KYC remains deferred and the
commercial fee idea is tabled at the user's request.

## Next required gate

On the trusted computer, verify real local sign-in, wallet/history recovery and
the new activity screen. Validate live/forked Sepolia synchronization, deposit
simulation and gas limits before integrating/enabling the signing path. The first
small deposit still needs the user's explicit transaction approval, canonical
event verification, spendable private-balance confirmation and recovery testing.
Private merchant proof/submission/settlement and encrypted receipts remain unfinished.
