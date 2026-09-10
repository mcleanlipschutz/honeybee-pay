# Honeybee Pay checkout — Privy integration

This React application adds Privy email login, an embedded Ethereum buyer wallet,
reviewed Sepolia USDC transfers and receipt verification. It targets Privy's
financial-flow prize through an actual wallet/payment integration. Eligibility
is not established until a working live flow is demonstrated.

The [product direction](../PRODUCT_DIRECTION.md) keeps wallet creation inside
Honeybee and defines the planned verified-profile and private merchant checkout
flow. Email login is not KYC, and this checkout's public wallet is not itself a
privacy mechanism. The next integration starts with authenticated ownership and
recovery for each user's private wallet.

## Run

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
spending keys and encrypted backups are separate. No RAILGUN secrets are exposed
to this frontend or placed behind an unauthenticated server endpoint.

This checkout currently performs a **public** ERC-20 transfer. It does not shield,
submit a RAILGUN private payment, or claim that Privy policies protect RAILGUN
spending keys. Integrating shielding and private checkout requires a reviewed
transaction bridge plus ownership/authentication and recovery design.

The approval checks are application controls, not an independently enforced
onchain firewall or a Privy policy. The five-minute approval expires before wallet
submission; it is not a deadline enforced by the USDC contract or Privy's modal.
Receipt state is in memory: retain the explorer link before refreshing or closing
the page. Durable invoices, server-side idempotency and merchant reconciliation
remain required before production use.

## Validation and remaining setup

- `npm test`: 4 tests passed, covering exact amount encoding, changed approval
  fields, expiry, sender changes, invalid inputs, and matching receipt events.
- `npm run build`: passed. Privy produces a large wallet-modal chunk; optimization
  remains before production deployment.
- Browser verification could not finish: the environment's usage limit blocked
  the browser download. No browser or mobile pass is claimed.
- Live Privy authentication, account creation and a funded test transfer have not
  been exercised: a real public App ID and test funds are still required.
- The initial audit found 27 findings (25 moderate, 2 high). Axios was updated
  through a scoped override to 1.18.0. The remaining ws 8.x update and final audit
  were blocked by the environment usage limit. Remaining findings are unresolved;
  no clean-audit claim is made. The separate privacy package was unchanged.

## Sources

- [Privy React setup](https://docs.privy.io/basics/react/setup)
- [Privy transaction hook](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction)
- [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [ETHOnline sponsor requirements](https://ethglobal.com/events/ethonline2026/prizes)
