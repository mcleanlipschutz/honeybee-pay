# Honeybee private-payment test

Updated September 13, 2026. Current Windows instructions for
`codex/privacy-segment-1a`. This flow runs on the trusted computer at
**http://127.0.0.1:4173**. The separately hosted checkout remains a public-transfer demo.

Earlier Windows diagnostics found no broadcaster accepting Circle test USDC.
The latest Windows check now found a compatible Sepolia WETH offer and verified
the pinned fee-token contract. This implementation keeps the
merchant payment in Circle test USDC and pays the broadcaster in **Sepolia WETH**.
No real USDC or mainnet assets are needed.

The implementation includes funding, separate balances and fee consent, bound
RAILGUN transfer/POI generation, broadcaster submission, encrypted pre-send
records and buyer/merchant receipt checks. **A funded end-to-end private payment
has not yet been validated.** Two real synthetic Groth16 proofs passed the
live Sepolia verifier; that does not establish spendable roots, POI or settlement.

## Current laptop checkpoint

**Latest UI update:** The next supplied terminal log contained a saved-history
read followed by three successful quote operations (`fee-estimate` and
`quote-validation`), with no `proof-generation` or `broadcast`. It does not
establish which UI control was used. The form previously made the quote button
the first submit control, so implicit Enter could obtain another quote. Quote,
confirm and status now have separate explicit handlers. Enter in a password
field with a reviewed quote only displays instructions; it neither quotes again
nor authorizes payment. Quotes clearly ask for the recovery password again.
The password is cleared between operations while the selected fee limit stays.

This UI update **requires rebuilding checkout**. In the existing PowerShell
window, stop the server with Ctrl+C (Y if asked), then run each command separately:

```powershell
cd "C:\Users\McLean Lipschutz\honeybee-pay-windows\privacy"
git pull --ff-only
cd ..\checkout
npm.cmd run build
cd ..\privacy
npm.cmd run wallet:web
```

Reload the local page with Ctrl+F5. Open saved history again before deciding
whether an attempt is unsubmitted. For an unsubmitted request, obtain a fresh
quote, re-enter the recovery password in the payment form, and click Confirm
private payment once. Keep the page and server open. Pending/unknown/reverted
attempts require the original-payment check. Actual Windows confirmation and
funded merchant receipt validation remain pending.

### Earlier broadcaster checkpoint

McLean confirmed the WETH wrap, approval and shield deposit, and a completed
private scan showed **0.0049875 Sepolia WETH spendable for fees**. The subsequent
2-test-USDC shield deposit was reported confirmed. A quote for **1 test USDC**
then passed scanning and fee estimation with a **0.003241516569835368 Sepolia
WETH** fee, below the buyer-selected **0.004 WETH** maximum. The earlier 0.001
maximum had correctly rejected that fee.

Confirmation stopped at `broadcaster: BROADCASTER_UNAVAILABLE`, before proof
generation or broadcasting. Saved private payments displayed **Not submitted**
for request `hb_045147920a16e5625d87b834467557f6`. The later `shutdown: COMPLETED`
was the saved-history lookup, not settlement. These are user-reported terminal
and browser observations. No private merchant payment is confirmed.

A reconnect defect was reproduced against a rotating-offer fixture: the pinned
SDK replaces the latest cached fee advertisement for each broadcaster instance,
but Honeybee previously required the original `feesID` to reappear. The fix can
use a fresh SDK-verified offer ID only for the **same private fee recipient, WETH
token and numeric fee rate**. It rechecks those terms when preparing the encrypted
submission. The merchant amount, exact quoted fee, gas terms, original quote
expiry, account session and before-send journal checks remain unchanged. A new
rate requires a new user-reviewed quote; no replacement payment is auto-sent.
This fixes a reproduced cause consistent with the laptop failure, not a verified
live settlement. Fresh network availability is still required.

The earlier broadcaster fix changes only the local backend. Stop `wallet:web` with Ctrl+C in its
original PowerShell window, answer Y if asked, run `git pull --ff-only`, then
`npm.cmd run wallet:web`. No install, frontend build or artifact download is
needed. Reopen the same merchant request, set the maximum fee to **0.004 WETH**,
and get a new quote. Review its current fee before confirming once. For any
pending/unknown/reverted entry, check its original attempt instead of issuing a
new payment. Keep the server and page open throughout proving and submission.

Terminal diagnostics report fixed stage/reason labels without passwords,
addresses, balances, proof material, URLs or raw errors. Copy these printed lines;
do not type them as commands. `BROADCASTER_QUOTE_UNAVAILABLE` means the matching
fresh fee offer was unavailable before submission; `QUOTE_INVALID_OR_EXPIRED`
means the original consent window ended. A `COMPLETED` server operation alone
never proves that the private payment settled.

For the fee-delay update, use the exact pull/build/restart sequence in
[FINAL_HOURS.md](FINAL_HOURS.md); no reinstall or artifact download is needed.
Independent RPC reads now overlap at the same checked block; the POI probe runs
before selecting that block. One final full re-simulation replaces two. The same
60-second block freshness limit and fee caps still apply. Start the next step
while the countdown is active; the final checks can consume some remaining time.
Expiry disables a new confirmation but retains an existing attempt's status and
original-transaction check. Windows confirmation must still validate the fix.

## 1. Update and verify availability

Stop the server with **Ctrl+C** in its original PowerShell window. Keep that
window so any account-directory environment setting survives. If asked
`Terminate batch job (Y/N)?`, enter `Y`. Run each command separately after the
previous one finishes. Copy commands only, without prompts or sample output.

```powershell
cd "C:\Users\McLean Lipschutz\honeybee-pay-windows\privacy"
git pull --ff-only
npm.cmd run fee-token:preflight
npm.cmd run broadcaster:preflight
```

No dependency reinstall or artifact download is needed for this update if the
previous installation and both artifact-preparation commands succeeded.
`fee-token:preflight` must return **`fee-token-verified`**. It checks Sepolia,
WETH runtime code, symbol and decimals at a canonical block; it opens no wallet.

The broadcaster command should finish within about 95 seconds. Leave the
terminal alone until its prompt returns. Look for **`private-broadcaster-ready`**.
This now selects the verified WETH token with RelayAdapt support. If unavailable,
share the complete final JSON before funding. An observed earlier offer does
not guarantee a current offer for this route. Do not rerun unchanged connection
troubleshooting or switch to real funds.

`paymentReady:false` is expected from both preflights: they neither authorize
spending nor establish a funded private wallet. Diagnostic counters now use
`maxEligibleRequestedTokenOffers`; `requestedFeeToken` identifies WETH.
All fee signatures, expiry, POI and protocol filters remain enabled.

## 2. Build and open the page

After both checks pass:

```powershell
cd ..\checkout
npm.cmd run build
cd ..\privacy
npm.cmd run wallet:web
```

Keep the server running. Open **http://127.0.0.1:4173**, refresh with **Ctrl+F5**,
sign in as buyer and use **Wallet → Check my wallet**. Keep the existing wallet,
recovery copy, password and account directory. Do not create a replacement wallet.

## 3. Fund the private fee balance

Use Sepolia ETH only. The public wallet needs the wrapping amount **plus gas**.
A small starting fee deposit is **0.005 Sepolia WETH**, with a maximum deposit
of 0.01 WETH per review. The app shows the actual protocol fee and private credit.

1. In **Wallet → Test deposit tools → Review test deposit**, select
   **Private payment fees · Sepolia WETH**.
2. Enter `0.005` and the buyer recovery password. Compare the public funding
   address, private receiving address, token, amount and expected private credit.
3. Choose **Check network fee**. Switch to Sepolia if the app requests it.
4. If the wallet has insufficient public WETH, the next button wraps only the
   shortfall from Sepolia ETH. Confirm that separate wallet transaction and use
   **Check original transaction** until `wrap-confirmed`.
5. Choose **Refresh network fee**. If allowance is insufficient, approve exactly
   the reviewed WETH deposit amount. Check its original transaction until
   `approval-confirmed`. An approval does not deposit funds.
6. Refresh the network fee again. Confirm the separate WETH deposit and check
   its original transaction until `deposit-confirmed` (finalized block required).
7. **Sync private balance**. WETH must appear as spendable private fee funds.
   A confirmed deposit alone does not establish POI eligibility.

Already wrapped WETH or a sufficient allowance skips the corresponding step.
Each step preserves the same reviewed private note. If a review expires, use
**Deposit activity** to reconcile the saved original transaction before starting
another review. Never repeat an uncertain wrap, approval or deposit blindly.

## 4. Fund the merchant-payment balance

Select **Merchant payments · test USDC** in the deposit review. A **2-test-USDC**
deposit leaves change for a **1-test-USDC** request after the protocol deposit fee.
Review, check the network fee, approve exactly 2 test USDC if required, wait for
`approval-confirmed`, refresh the fee, then separately confirm the deposit.
Wait for `deposit-confirmed` and sync until both private balances are spendable.

The two assets are never added as raw units: test USDC has 6 decimals; WETH has
18. Both public funding flows reveal funding address, token, amount and timing.

## 5. Create and pay a merchant request

1. Sign in as the separate merchant, check its wallet, and use **Request payment**
   to create a `1.00`-test-USDC request. Choose enough time, for example 24 hours,
   and download its `.json` file.
2. Sign in as buyer, check the wallet, choose **Pay a request**, and open that file.
   Compare the reference, recipient and amount through your trusted merchant
   channel. A request file is not identity verification; do not edit its expiry.
3. Enter a **maximum broadcaster fee in Sepolia WETH**, initially `0.001`, and the
   buyer recovery password. Choose **Check total and fee**. This is read-only.
4. Review the merchant USDC amount and actual separate WETH fee. The fee cap is
   at most 0.01 WETH. Enter the password again and confirm the private payment once.
5. Keep the page and server running during proof/POI generation, deployed proof
   verification and broadcaster submission. The worker has a 15-minute limit.
6. Use **Check original payment**. It completes outgoing POI/history work and
   verifies the exact batch, both nullifiers, encrypted outputs and canonical
   receipt. It does not send another payment. After reload, use **Saved private
   payments**.
7. Sign in as merchant and choose **Request payment → Check received private
   payments**. Enter the merchant recovery password. Require **Received 1 test
   USDC privately** for the same request/transaction as the buyer's confirmed
   original payment.

The broadcaster hash starts as an unverified candidate. Original nullifiers can
recover a lost response even when the two inputs belong to different Merkle
trees. Merchant receipt matching requires decrypted exact amount/request memo,
valid POI and a confirmed protocol transfer. A public USDC transfer or deposit
cannot create this receipt. Two blocks are required for private payment receipt
confirmation; this is not an irreversible-finality or delivery-of-goods claim.

## Proof binding and limits

Two independent direct proofs would let a broadcaster submit only its fee. This
flow binds both proofs to the reviewed RelayAdapt address and to the hash of the
ordered input nullifiers, transaction count and empty action list. Both proofs
must execute together through that relay. No unshield, arbitrary call or public
sender fallback is permitted. The relay emits two `Nullified` events and one
aggregate `Transact` event; receipt checks require the entire original payload.

- New payments require **two 01x02 proofs**, each with one input and two outputs.
  Both assets must leave change. Unsupported exact-balance or fragmented note
  shapes fail before quoting/proving instead of loading unreviewed circuits.
  Historical single-proof receipts remain readable; old quotes require renewal.
- A delivered proof has no onchain expiry. Pending, unknown and reverted attempts
  continue blocking replacement payments; an outer revert does not revoke a
  private authorization. No same-nullifier cancellation UI is implemented.
- Requests are capped at 10 test USDC. The encrypted journal holds up to 16
  attempted payments. Keep account storage intact: wallet/history backups do
  not include this journal. Deleting it is not evidence that no payment happened.
- RPC, Privy, history/POI services, broadcasters and protocol administrators
  remain trust and availability dependencies. Independent recovery/unshield exit
  has not been demonstrated. Keep this experiment to test assets.

## Evidence and remaining gates

See [the fee-path validation report](privacy/reports/separate-fee-validation.json).
The WETH runtime pin and 18-decimal metadata matched live Sepolia at finalized
block `0xb27552`. Two real synthetic 01x02 Groth16 proofs passed the deployed
verifier at block `0xb27572`; changing to a one-proof binding failed verification.
The relay's live `getAdaptParams` agreed with the independent encoder. These
were read-only calls from a non-bypass address, not funded transactions.

43 focused runtime tests, four focused balance/sync tests and all 39 checkout tests passed. Tests of funding
simulation, wallet prompts, actual SDK iterative fee estimation and payment
recovery use explicit wallet/RPC/proof-generator doubles. The proof smoke uses
real Groth16 with synthetic notes. Independent source review verified the
cross-tree recovery, quote-shape and allowance fixes. The production client and
server build passed with existing bundle warnings. This is not a security audit.

The remote review browser could not open the local preview (`ERR_BLOCKED_BY_CLIENT`),
so this update's rendered UI and actual wallet confirmations still need laptop
validation. **Still required:** a fresh compatible WETH/RelayAdapt offer, funded
wrap/approval/deposit, spendable balances after restart, actual transfer and POI,
matching merchant receipt, and original-attempt recovery after that transfer.

## CROPS review

Chosen default: existing pinned RAILGUN contracts, local account keys/proving,
separate exact public funding approvals and a broadcaster for the bound private
batch. No custom contract or mainnet deployment is introduced.

| Area | Accepted testnet compromise and escape path |
| --- | --- |
| Censorship resistance | Privy, RPC/history/POI services, Circle controls, broadcasters and protocol pause/upgrade authorities can block progress. Configurable local endpoints reduce some dependence; complete independent exit is unverified. |
| Open | Application, pinned packages, ABIs and source records are inspectable on the draft branch. Hosted authentication/service operations are not reproduced by this repo. |
| Free | Application MIT does not cover every dependency: snarkjs is GPL-3.0, WETH9 is GPL-3.0-or-later, and reviewed Relay source declares UNLICENSED. Source verification is not permission to fork all code; upstream notices are preserved. |
| Privacy | Public wrapping and shielding reveal funding metadata; providers observe requests and traffic. Private outputs/memo are encrypted, but transaction hashes remain public. The local runtime receives keys/passwords while operating. |
| Security | Exact caps/approvals, code/verifier checks, local locks, encrypted records and original-attempt recovery constrain this experiment. Protocol administrators and local-computer compromise remain risks; account-independent recovery/unshield exit is unverified. |

No production, real-money readiness, or complete funded-flow validation is claimed.
