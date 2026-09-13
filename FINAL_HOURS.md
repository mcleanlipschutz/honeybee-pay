# Honeybee Pay: remaining steps

Updated September 13, 2026. McLean reported just over three hours remaining before
this preparation pass; that is a historical time budget, not a live countdown.
Use the signed-in organizer portal for the exact deadline and video limit.

## Ready without further user input

- Fee-delay fix: independent fixed-block reads overlap; the POI probe precedes
  block selection; one full final simulation replaces two. Expiry and fee caps
  remain enforced. The page shows a countdown and preserves original-transaction
  controls when a quote or review expires. Windows confirmation still needs testing.
- Current submission description, technical explanation, challenge narrative and
  AI disclosure: [SUBMISSION.md](SUBMISSION.md).
- Ready-to-read recording script, shot list and judging answers: [DEMO_SCRIPT.md](DEMO_SCRIPT.md).
- Current evidence and explicit limits: [handoff checkpoint](privacy/reports/final-handoff-validation.json).
- Hosted access rechecked: public, active, published version 3; local private features
  remain on the development branch. No public deployment or main merge in this pass.
- Sponsor requirements rechecked. Privy Best financial flow is the supported target;
  other unbuilt integrations should not be claimed.

## 1. Apply the update on the laptop

In the original PowerShell window running the local server, press **Ctrl+C**. If
asked to terminate the batch job, type **Y** and Enter. Keep that window open so
its account-directory setting survives. Enter each following command separately,
waiting for the prompt to return. Copy only the command, not prompts or output.

```powershell
cd "C:\Users\McLean Lipschutz\honeybee-pay-windows\privacy"
```

```powershell
git pull --ff-only
```

```powershell
cd ..\checkout
```

```powershell
npm.cmd run build
```

```powershell
cd ..\privacy
```

```powershell
npm.cmd run wallet:web
```

Leave the server running. Open **http://127.0.0.1:4173** and press **Ctrl+F5**.
No dependency reinstall, artifact download or blanket audit fix is needed for this
update. Do not recreate existing wallets, replace backups or remove storage.

## 2. Complete one funded private payment

The earlier compatible-WETH broadcaster and fee-token checks already passed on
the laptop. Fresh payment quotes still recheck current availability.

- [ ] Sign in as buyer and reopen **Wallet → Test deposit tools → Review test deposit**.
- [ ] Select **Private payment fees · Sepolia WETH**, amount **0.005**, and enter the
  recovery password. Check both wallet addresses and expected private credit.
- [ ] Click **Check network fee**. While its countdown is active, click the single
  next-step button. If needed: wrap the public WETH shortfall, confirm its original
  transaction, refresh the fee, approve exactly 0.005 WETH, confirm that original
  transaction, refresh the fee, then confirm the separate deposit. Each action
  requires your wallet confirmation. An approval is not a deposit.
- [ ] Wait for **deposit-confirmed**, then sync until the WETH is spendable privately.
- [ ] Review and deposit **2 test USDC** for a **1 test USDC** merchant request. Follow
  the exact approval/deposit checks again. Sync until both private balances are spendable.
- [ ] As merchant, create a fresh 1-test-USDC request, allowing enough time, and download it.
- [ ] As buyer, import it, verify its terms and check a separate WETH fee quote. Then
  confirm the private payment once. Keep the page and server running during proof/POI
  generation; this operation may take up to 15 minutes.
- [ ] Check the original payment until confirmed. As merchant, require **Received 1 test USDC privately** for that same request and transaction.
- [ ] Save the public transaction hash and non-secret confirmation screenshots. After
  a normal restart, recheck the saved original payment; do not send a second payment.

Detailed labels, fee limits and verification rules: [ZK_FLOW.md](ZK_FLOW.md).
All amounts above are Sepolia test assets. No real USDC is needed.
If the quote is immediately expired again, report how long Check network fee took;
do not repeat a pending or unknown transaction. Use original-transaction recovery.

## 3. Record and submit with a buffer

Protect at least **60 minutes** for recording/upload/submission and **30 minutes**
for a final buffer where time permits. If the first funded private payment remains
blocked when that reserve begins, record the verified components and disclose the
missing settlement. Do not spend the upload window on new features.

- [ ] Open the existing public receipt, local request/recovery screens and proof report.
- [ ] Use [DEMO_SCRIPT.md](DEMO_SCRIPT.md); record only what the screen demonstrates.
- [ ] Upload the video and play it back without relying on your signed-in account.
- [ ] Check portal length limits, screenshot requirements and live-judging availability.
- [ ] Paste [SUBMISSION.md](SUBMISSION.md), add the current branch/demo/video links,
  select supported prizes, review and submit.
- [ ] Save the portal's submission confirmation and recheck all links.

KYC, real-money fees, new sponsor integrations, QR/email features and cosmetic
redesign are outside this deadline pass. Wallet confirmations, account sign-ins,
recording and final portal submission require McLean.
