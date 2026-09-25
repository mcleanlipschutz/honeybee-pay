# Segment 1P: account-scoped private wallet synchronization

## Implemented

The protected local wallet API now accepts a `sync` action with the signed-in
account's access token and recovery password. It loads only that account's
existing wallet, checks the pinned Sepolia contracts and circuit key, verifies
POI service availability, and runs the SDK history scan. The browser offers
**Sync private balance** inside the local wallet setup flow.

Both UTXO and TXID histories must report completion, and a balance event must
match the exact loaded wallet, Sepolia chain and V2 transaction version. Only then
does the service ask Wallet SDK 10.9.0 for USDC using `onlySpendable=true`.
Negative, malformed, interrupted, expired-session and incomplete results fail
closed. A verified zero balance is explicitly different from an unavailable
balance. A positive result is a timestamped snapshot, not permission to spend.

The worker unloads the provider and stops its engine before returning. The wallet
is locked again and `networkLoaded` is false. `spendableBalanceVerified` describes
that completed snapshot only; `paymentReady` remains false. Status-only reads and
ordinary unlock/backup operations never reuse a prior balance as current evidence.
No private-payment button, shielding transaction, receipt or counter increment is
created by synchronization.

## Ownership, transport and keys

The existing server-verified Privy subject selects the account directory. The
caller cannot supply another owner, wallet ID, network, endpoint, path or key.
The recovery password must decrypt the account-bound backup before network access
begins. A missing merchant wallet cannot cause the buyer's wallet to be loaded.
The previous shared demo-role workspace is not used.

RPC and POI URLs are trusted local startup configuration. The CLI defaults to the
existing Sepolia PublicNode RPC and `https://ppoi.fdi.network`; `.env.example`
documents overrides. Network checks, POI configuration, SDK transport fixes and
reviewed artifacts reuse existing project code. No external endpoint receives the
recovery password, login token or mnemonic as an API field. Network providers can
still observe requests and metadata; wallet database transaction metadata is not
necessarily encrypted at rest. Keep it in the private local storage directory.

The local process remains a trusted runtime that handles decrypted wallet keys.
This is not browser self-custody or privacy from the host administrator. The HTTP
server remains bound to 127.0.0.1 with exact Host/Origin checks, bearer-token
verification, bounded requests and existing rate/concurrency limits. It is not
published or put behind a tunnel.

The scan has a 90-second cooperative deadline, the isolated worker a 120-second
hard stop, and the browser request a 125-second timeout. Sessions are rechecked
throughout scanning, before returning balances and after shutdown. A hard-killed
worker may leave a lock; the existing fail-closed manual recovery procedure still
applies. A browser cancellation does not promise that the backend scan instantly
stops, but account changes discard its UI result and do not switch its owner.

## Local startup repair

Segment 1O split checkout output into `dist/client` and `dist/server` for the shared
counter. The local wallet CLI now serves `checkout/dist/client`, fixing its old
`dist/index.html` assumption. The local private-wallet view omits the hosted usage
counter, whose D1 API is not part of the loopback runtime. The hosted test site's
existing counter and public payment flow remain its current published version.

Build the checkout, then run `npm run wallet:web` in `privacy/` with the existing
Privy public configuration. The local runtime advertises `accountSyncEnabled`;
no private API credentials or endpoints are exposed in that configuration response.
After local sign-in and backup verification, choose **Sync private balance** and
enter the recovery password. A successful result shows the snapshot and locks
the wallet again.

## Validation

- Nine focused privacy tests passed: real account creation/recovery/isolation,
  local API checks, sync lifecycle, foreign-wallet events, incomplete scans,
  cancellation, session expiry and invalid balances.
- The new real-worker integration uses a local wrong-chain RPC: forged tokens,
  other-account requests, wrong passwords and injected endpoints produce no RPC
  calls. An authenticated correct-password scan rejects the wrong chain and
  preserves the exact encrypted backup and wallet identity.
- Four browser-client tests passed, including rejection of incomplete sync
  responses and discarding results after an account change.
- Checkout build passed; the existing chunk-size warning remains.
- Built local page served HTTP 200 with synchronization enabled, using disposable
  authentication fixtures and no external calls.

Successful scan/balance tests use a controlled SDK fixture. This is not evidence
that these account-bound wallets have completed a live Sepolia scan or have any
shielded assets. Prior disposable shared-workspace scans are separate evidence.
A live account scan, browser recovery test, shielding and private payment remain
open in TEST_CHECKLIST.md. External RPC access was previously blocked in this
workspace; this segment does not retry that blocked route or weaken network or
protocol checks. No onchain transaction was signed or broadcast.

No dependency versions changed and existing dependency findings remain open.
KYC remains deferred until after testing and the submission-time review.

Next: run a live account scan on the trusted local test machine, then add reviewed
test-USDC shielding and verify the resulting spendable balance before private
invoice payment and encrypted receipt reconciliation.
