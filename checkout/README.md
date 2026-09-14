# Honeybee Pay mobile wallet

The everyday interface is a mobile web wallet with **Wallet, Pay, Request and Activity**. Email sign-in creates or opens a Privy embedded Ethereum wallet. The public deployment is https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site .

## Current capabilities

- Read the wallet's available Sepolia test-USDC balance; refresh automatically while the app is visible.
- Receive funds using a wallet address or QR code. This is crypto funding, not a bank/card on-ramp.
- Send test USDC to a wallet, scan a QR code using the rear camera, or paste a Honeybee request. QR image processing stays in the browser.
- Create fixed-amount or open-amount requests with a link and QR code, share through the phone's share sheet, and expire requests after 24 hours.
- Calculate network fees automatically. Show exact recipient, USDC amount and the maximum test-ETH network fee before one explicit Pay click.
- View verified sent/received transfers, load earlier history and find a transaction by hash.
- Reopen uncertain payment attempts and automatically check confirmation without sending again. Offer secure wallet export in Account > Wallet backup through Privy's separate-origin modal. Honeybee never reads the exported private key.
- Home-screen metadata for the mobile web app. This is not an App Store/Play Store native application.

**Test scope:** Ethereum Sepolia, Circle test USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, chain 11155111, 6 decimals, maximum 10 USDC per payment. No real money, swaps, arbitrary assets, bank deposits or private payment settlement in this mobile flow. Transactions are public. Existing experimental privacy tools are documented separately.

## Run and build

Requires Node >=22.12. Use `npm ci`, `npm test`, then `npm run build`. `npm run dev` starts local Vite development. Set public `VITE_PRIVY_APP_ID` and, if applicable, `VITE_PRIVY_CLIENT_ID` for your own Privy app and allow your domain there. Never put a secret in a `VITE_` variable. Email OTP is handled directly by Privy. The authentication-ready flag is independent of wallet-ready state so first-time sign-in does not wait for a wallet that does not yet exist.

The build produces `dist/client` and a Worker at `dist/server/index.js`. Hosted payment intent tracking requires the D1 schema in `drizzle/`, the `DB` binding, and your app's authentication configuration in `server/auth.mjs`. A fork must replace the app ID and public verification key there. Existing Sites configuration identifies this deployment and must not be reused for someone else's fork.

The public RPC is explicitly pinned to `https://ethereum-sepolia-rpc.publicnode.com` in the mobile client, receipt reader and counter server. A self-hosted fork can replace these three endpoints together. No hidden fallback or default API key is used. Public RPC rate limits remain a prototype availability constraint.

## Fees and consent

`automatic-fees.mjs` validates chain, token bytecode, decimals, sender balance and simulated transfer. It estimates EIP-1559 gas/fees automatically, buffers the gas estimate by 20%, and refuses a maximum cost above 0.001 test ETH. This policy is set in code, not by the payer. The fee review expires after 60 seconds. A send revalidates wallet/account, request expiry, balances and simulation, and submits the reviewed gas and fee ceilings unchanged. High fees or stale totals require a new review.

The Pay button is the user's explicit authorization. The redundant Privy transaction modal is suppressed only for that click. No sign-in, QR scan, request open, history load, status check or balance refresh invokes a send. There is no allowance approval, autonomous agent spending or delegated signer. The Privy converter receives a hexadecimal nonce so a first-wallet nonce of zero cannot disappear through a falsy-value conversion.

Gas sponsorship is **not enabled or verified**. Current fees still require test ETH, but the user never chooses a fee. Fully hiding the need for a second asset requires a configured sponsor budget and a tested sponsorship/recovery path before launch. The optional fee-review helper's sponsored branch is not used by the production screen.

## Requests and receipts

Honeybee links use a URL fragment so request fields do not appear in HTTP paths. They carry version, UUID, chain, pinned asset, recipient, optional amount and expiry. Links are unsigned payment instructions, not authenticated merchant identities or one-use invoices. Payers inspect the full recipient and amount. Only the exact Honeybee origin is accepted. Arbitrary contract calls, other chains, assets, unknown fields and excessive/ambiguous amounts are rejected. EIP-681 support is limited to explicit Sepolia address requests or the pinned USDC transfer with exact atomic amount. Receive QR codes contain a raw wallet address and the page states the required network/asset.

`mobile-attempt.mjs` stores public pending intent metadata before calling the wallet. Web Locks serialize send operations across same-origin tabs. A random attempt ID and identity-checked recovery writes prevent slow old checks from overwriting a newer send. Unknown SDK/network errors keep the send locked. Only an explicit provider rejection before a hash, or a matching canonical confirmed/reverted transaction, resolves the uncertainty. Corrupt/unavailable browser storage fails closed without deleting the record.

Recovery requires the exact sender, recipient, token call, amount, nonce and canonical block, at least two confirmations and matching transfer log. Automatic hash discovery scans the first 1,000 blocks after the attempt. A later transfer can be checked by its exact transaction reference. Do not clear browser data or start a replacement on another device while a payment is unresolved. The journal protects this browser/origin, not all devices. Request replay prevention and cross-device spending locks are not claimed. The hosted aggregate counter retains its stricter finalized-block rule.

## Privacy development and Midnight

On an authenticated local test runtime only, `?tools=1` opens the preserved development tools. Technical controls and experiments are absent from the everyday mobile navigation. Read [legacy development notes](LEGACY-DEVELOPMENT.md) for those flows. The `src/shared/` modules are a self-contained snapshot of the repository's `shared/` contracts for those tools.

The independent Apache-2.0 [Midnight module](../midnight/README.md) compiles owner-authenticated invoice commitments and one-time consumption. A tested adapter now maps Honeybee request terms into the Compact invoice in local simulation. The mobile app does not yet submit Midnight proofs or settle private payments. Midnight approval must never be presented as a payment receipt.

## CROPS Review

Chosen default: preserve email-based embedded-wallet access and direct USDC transfers while reducing UI complexity. An independent wallet with configurable infrastructure offers stronger exit properties, but changing the authentication model would defeat this iteration's requested simple login. No new spending authority is introduced.

Censorship resistance: Privy, the frontend/API host, PublicNode and the token issuer can gate access or transfers. Source, schema, ABI and build steps are public. A fork can replace hosting/RPC. A user can export their key through the secure account backup flow while Privy remains available and use an independent client. Export/recovery after the provider disappears has not been demonstrated.

Open: frontend, intent tracking, receipt checks and Midnight source are inspectable. The deployment records its exact source commit. Privy's hosted auth/signing infrastructure is an external service and cannot be reproduced merely by forking this repo.

Free: the existing project and mobile code retain MIT. New `midnight/` code and evaluation material use Apache-2.0. Those licenses permit forks; running a fork with Privy still depends on its service terms.

Privacy: Sepolia observers can see balances, counterparties, amounts and timing. Privy sees email authentication. RPC/hosting can observe wallet/IP/request metadata, and wallet SDK telemetry needs a dedicated network audit before production. QR decoding is local. Request fragments reduce server-path leakage but are visible to whoever receives the link. Browser journals contain public payment metadata only. No seed or private recovery material is sent to our tracking API.

Security: wallet keys/signing depend on Privy. There are no new upgradeable Honeybee payment contracts, token allowances or session signers in this flow. Exact review, expiry, bounded fee caps, duplicate-click locks and verified recovery constrain the app's behavior. These client controls do not provide independent onchain spending enforcement or protect against malicious replacement frontend code. Circle's test-token authority remains external. Independent production review, physical-phone testing and a completed wallet backup/recovery exercise remain necessary before real funds.

Accepted compromise: a public testnet prototype with hosted sign-in and public RPC, not a production private wallet. The terminal test suite and JSX handler doubles are automated; they are not physical-camera, real email authentication or funded-wallet tests.

## Validation record

### September 14 reliability follow-up

Balances refresh every 15 seconds after the previous read completes. Pending payments reconcile every 12 seconds after the previous check, using the existing exact-transfer, nonce and canonical-receipt verifier. Refreshes pause when the tab is hidden and resume on focus/visibility. Only one read per loop can run at once; cleanup invalidates late results. Automatic recovery uses a nonblocking browser lock and the existing attempt-ID guard, stops at a terminal result, and never invokes wallet signing or resubmission. Manual refresh and Check status remain available.

After 20 seconds of stalled sign-in or wallet loading, the screen offers a page reload. This preserves the request URL and local payment journal. It is a recovery option, not evidence that a provider/domain or real-device authentication problem has been resolved. Fee-promotion copy was removed from the wallet; the fee stays visible in payment review.

All 64 checkout tests and the production build pass. Four additional tests cover overlapping foreground events, hidden-tab pause/resume, transient read failure, cleanup during a slow read and terminal-result shutdown. Physical-phone email login, camera use and funded sending remain unverified. See `reports/mobile-reliability-validation.json`.

This iteration passes 60 checkout tests, including actual JSX handler doubles for explicit consent, duplicate clicks, account changes and nonce zero, plus the production build. No physical phone/authenticated funded payment was exercised here. `npm audit fix` applied compatible updates; 27 moderate dependency advisories remain, with no high/critical findings in this registry audit. Some suggested fixes are breaking downgrades and require separate dependency review. See `reports/mobile-simplification-validation.json`. This is not an independent security audit.
