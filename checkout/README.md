# Honeybee Pay checkout — Privy integration

This React application adds Privy email login, an embedded Ethereum buyer wallet,
reviewed Sepolia USDC transfers and receipt verification. It targets Privy's
financial-flow prize through an actual wallet/payment integration. Eligibility
is not established until a working live flow is demonstrated.

The [product direction](../PRODUCT_DIRECTION.md) keeps wallet creation inside
Honeybee and defines the planned private merchant checkout flow. KYC is deferred
until testing is complete and the remaining time before submission is reviewed;
it may wait until after the contest. Email login is not KYC.

The [local wallet flow](../privacy/SEGMENT-1L.md) now connects this browser UI to
authenticated private-wallet creation, encrypted-backup download, saved-file
verification and restoration. The local test runtime handles wallet keys and
recovery passwords. Live Privy login and browser validation remain outstanding.

## Run

For the complete local wallet setup, follow [Segment 1L](../privacy/SEGMENT-1L.md):
build this checkout, configure the public App ID and verification key in
`privacy/.env.local`, then run `npm run wallet:web` from `privacy/`. Its loopback
server supplies the public App ID to the browser and serves the account API.

For a frontend preview or the existing public checkout:

```sh
cd checkout
npm ci --ignore-scripts
cp .env.example .env.local
npm run dev -- --host 127.0.0.1
```

Set `VITE_PRIVY_APP_ID` to the public App ID from your Privy dashboard. Set the
optional `VITE_PRIVY_CLIENT_ID` if using an app client. Enable email login and
Ethereum embedded wallets, and allow the exact development origin in Privy's
dashboard (normally `http://127.0.0.1:5173`). Add the final HTTPS origin before
deploying. Never add a Privy app secret, seed phrase or RAILGUN database password
to a `VITE_` variable; all such variables are public in the built application.

Without an App ID, the app displays a clearly labeled checkout preview with
wallet/payment buttons disabled. It does not simulate successful login or payment.

## Payment flow

1. Sign in with email. Privy creates an embedded Ethereum wallet; the app selects
   a Privy wallet explicitly, rather than silently using an external wallet.
2. Fund that buyer with **Sepolia** test ETH for gas and Circle's test USDC. The
   app displays the full funding address and a Circle faucet link. Fund a separate
   merchant public address as needed for subsequent demo work. Test assets have no
   financial value; do not send mainnet funds.
3. Enter the merchant's public `0x` address and an amount up to 10 USDC. Review
   the immutable recipient, amount, sender, chain and token snapshot.
4. Optionally run the local recipient-change test. The changed proposal must be
   rejected before signing. This does not send an attacker transaction.
5. Approve and pay. The app checks the selected account, chain, token presence,
   decimals, USDC balance and test-ETH balance; simulates the transfer; rechecks
   approval/account state; then opens Privy's confirmation UI.
6. Once submitted, sending again is disabled. Receipt verification waits for two
   confirmations and requires exactly one matching USDC Transfer event. A receipt
   timeout retains the transaction link and offers verification retry, not another
   send. A replacement transaction's verified hash is shown if applicable.

The token is pinned to Circle's published Ethereum Sepolia USDC address:
`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, with six decimals. Chain ID is
11155111. Public reads use `https://ethereum-sepolia-rpc.publicnode.com`.

## RAILGUN boundary

Privy controls the public buyer wallet; `../privacy` retains the independently
tested RAILGUN wallets, private-transfer adapter and synchronization code. Their
spending keys and encrypted backups are separate. The local setup sends the
user-entered recovery password to its authenticated loopback runtime and receives
an encrypted backup. The runtime retains decrypted keys only while its worker
runs; raw wallet seeds and database keys are not returned to the browser.

This checkout currently performs a **public** ERC-20 transfer. It does not shield,
submit a RAILGUN private payment, or claim that Privy policies protect RAILGUN
spending keys. Integrating shielding and private checkout requires a reviewed
transaction bridge and a completed live onboarding/recovery validation.

The approval checks are application controls, not an independently enforced
onchain firewall or a Privy policy. The five-minute approval expires before wallet
submission; it is not a deadline enforced by the USDC contract or Privy's modal.
Receipt state is in memory: retain the explorer link before refreshing or closing
the page. Durable invoices, server-side idempotency and merchant reconciliation
remain required before production use.

## Validation and remaining setup

- `npm test`: 7 tests passed, covering payment controls plus remote-destination
  rejection, stale account responses, and no automatic retry of wallet writes.
- `npm run build`: passed. Privy produces a large wallet-modal chunk; optimization
  remains before production deployment.
- Browser and mobile interaction testing remains outstanding. No browser pass is
  claimed by the client/API integration tests.
- Live Privy authentication, account creation and a funded test transfer have not
  been exercised: the supplied public App ID and key are configured, while live testing and test funds are still required.
- The initial audit found 27 findings (25 moderate, 2 high). Axios was updated
  through a scoped override to 1.18.0. The remaining ws 8.x update and final audit
  were blocked by the environment usage limit. Remaining findings are unresolved;
  no clean-audit claim is made. The separate privacy package was unchanged.

## Sources

- [Privy React setup](https://docs.privy.io/basics/react/setup)
- [Privy transaction hook](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction)
- [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [ETHOnline sponsor requirements](https://ethglobal.com/events/ethonline2026/prizes)

## Mobile test access (Segment 1M)

The hosted checkout uses the public development App ID in `.env.production`.
Its initial wallet page supports email login, the automatically created Privy
Ethereum wallet, copying its public address, and sign-out. On narrow screens the
active form appears first. Existing reviewed public Sepolia payments remain in
the Public test checkout tab. No browser or live-login pass is claimed yet.

The hosted page does not expose the loopback account API. Private RAILGUN wallet
creation, backup and restoration still require the local runtime on a computer.
No private wallet keys, recovery files or backend configuration are deployed.
KYC remains deferred. Hosting the app does not enable private settlement.

The Sites deployment uses a dedicated source snapshot of this `checkout/`
directory, with its own Git root, so the unrelated contract/privacy sources and
runtime storage are not sent to the hosting source repository. The snapshot must
match the tracked checkout source; make future changes here and refresh that
snapshot before publishing. Reuse `.openai/hosting.json` for this Site.

The latest production dependency audit reports 25 unresolved findings (24 moderate,
1 high). The high finding is `ws` memory exhaustion in the Node WebSocket package;
this deployment serves browser assets without a Node WebSocket server. These
findings still need review before a broader release. Versions were not changed.

## Receipts (Segment 1N)

The Receipts tab rebuilds this wallet's sent and received USDC history from
Ethereum Sepolia. The current public chain is the durable source: no local-only
receipt cache or server inbox is required to reopen a transfer after signing in
on another device. It includes faucet funding and transfers outside Honeybee;
it does not claim every transfer is a Honeybee purchase or an invoice.

The reader scans the latest 10,000 confirmed blocks per page, with Load older
and exact transaction-hash lookup for older activity. Each candidate is checked
against its successful transaction receipt and canonical block hash, pinned USDC
contract, matching wallet/event details and at least two confirmations. A failed
page does not advance the cursor or silently claim a complete history. More than
60 candidate transactions in a page produces an explicit error and offers hash
lookup. Dates come from block timestamps. Self-transfers have one receipt.

Recipients and senders can reopen the same transfer reference, view full details,
follow its explorer link and download a text receipt. Account/wallet changes
remount the view; requests are cancelled and late results discarded. History is
public-chain data, not a secret or proof of identity. No email is sent.

Eleven checkout tests passed. A live read-only check rediscovered the September
10 payment of 1 USDC as Sent for the buyer and Received for the merchant, with
the same receipt reference. The buyer also sees the 20-USDC faucet transfer.
The new receipt UI/download flow still needs user browser testing.

See ../RECEIPTS_DESIGN.md for the planned encrypted ZK receipt source. The current
public log reader cannot recover shielded payment details.


## Segment 1O — shared test-payment count

The opening page now shows **Test payments completed**, without requiring Privy
sign-in. The Site itself retains its owner-only access policy. This is a count
of registered, finalized checkout payments, not transferred dollar value,
customers, purchases of goods, mainnet activity or a security endorsement.

A Cloudflare Worker and logical D1 `DB` binding now serve `/api/payment-count`,
`/api/payment-intents` and `/api/payment-submissions`. The existing Vite/React
checkout is preserved. Builds produce `dist/client` and `dist/server/index.js`;
Drizzle owns the schema migration. `npm run dev` / `npm run preview` are frontend
previews only: they do not supply D1 or the hosted tracking API. The local
private-wallet runtime remains separate and is not deployed.

Before requesting a wallet signature, hosted checkout registers approved terms
with a server-verified Privy access token. The server pins the app ID and the
owner-supplied public verification key; key rotation requires updating it. It
stores a hashed account identifier, public payment terms, registration time and
chain height. No email, login token, seed or private-wallet data is persisted.
The token identifies the requester, not legal identity or ownership of an
arbitrary supplied wallet; a counted transfer must actually be signed by the
recorded sender onchain. This does not attest that a person used an unmodified
browser UI, and repeated payments between wallets can still increase usage.

Only a successful direct Sepolia USDC transfer with exactly the recorded sender,
recipient, amount and calldata, mined after registration and within the approval
window, becomes complete. It must be at or below the RPC's finalized head and
match its canonical block. A database uniqueness constraint counts each verified
transaction once. Candidate hashes never reserve that uniqueness key. Same-wallet
transfers, failed attempts, unrelated receipts, funding and click activity do not
count. This counter is specifically testnet-only; a future production counter
must start separately.

Reconciliation runs on summary reads, at most once per minute per isolate,
processing two pending records per pass. It can recover an unreported transaction
from matching Transfer logs after a tab closes. Searches cover at most 1,001
blocks and inspect two matching candidates per record per pass. Large bursts of
identical concurrent transfers may require additional reconciliation tooling;
this small-test implementation must not be advertised as exhaustive production
analytics. Records without a verified completion can expire after 24 hours;
provider outages never turn a pending record into a completed one. The count
normally trails the two-confirmation receipt by Ethereum finality time and may
trail further during RPC outages or pending-record backlogs.

The single pre-counter import is the reviewed first mobile test recorded in
Segment 1N. Its exact hash and approved terms are in server code. The Worker
rechecks it before inserting it, and the same transaction uniqueness rule
applies. No migration inserts a numeric seed and browsers cannot submit arbitrary
historical backfills. The public endpoint exposes only the total, network and
finality label. It never returns account IDs, addresses, amounts or hashes.

For ZK, this public-transfer registry must be replaced with a privacy-aware
completion source and an explicit aggregation/retention policy. Do not copy
private receipts, private wallet addresses or decryption keys into this table.

Validation: 16 checkout tests pass, including actual SQLite migration/queries,
duplicate submissions, account isolation, token verification, wrong network,
reverted/mismatched/nonfinalized transfers, bounded registrations and recovery
after a missing submission callback. The Worker/client build passes. Production
dependency audit still reports 24 moderate and 1 high issue in existing transitive
dependencies; this task does not resolve that backlog. No new onchain transaction
was signed or broadcast. A fresh direct RPC check from this workspace was blocked
by its network policy; hosted RPC access and a new mobile payment still require
live validation after publication.
