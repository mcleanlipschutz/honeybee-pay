# Honeybee Pay: final 30-minute submission plan

Updated September 13, 2026 after McLean reported less than 30 minutes remaining.
This is a time budget, not a verified portal deadline. Freeze features now.

## First 5 minutes: preserve a submission draft

Open the organizer portal now. Paste [SUBMISSION.md](SUBMISSION.md), add the
[public demo](https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site) and
[implementation branch](https://github.com/mcleanlipschutz/honeybee-pay/tree/codex/privacy-segment-1a),
and save the draft. The working submitted product is the public testnet checkout
with Privy login, reviewed payments and verified receipts. The local privacy
prototype is demonstrated separately and still needs confirmed settlement.
No new sponsor integration, main merge, dependency upgrade or hosted deployment.

## Next 5–8 minutes: one optional original-payment recovery

The latest update fixes the relay flag rejected by the reference broadcaster
and adds explicit compatible-proof recovery using BOTH original input notes.
It preserves the original 1-test-USDC payment and original WETH fee. The actual
operator's discarded error reason was unknown, so success is not guaranteed.
Do not make a replacement merchant request, payment, wallet or deposit.

If time allows, stop the server with Ctrl+C (Y if asked) in the same PowerShell
window, then run:

```powershell
cd "C:\Users\McLean Lipschutz\honeybee-pay-windows\privacy"
git pull --ff-only
cd ..\checkout
npm.cmd run build
cd ..\privacy
npm.cmd run wallet:web
```

Ctrl+F5. As buyer, open Saved private payments → Review payment recovery for the
original unknown attempt. If the review completes, verify **1 test USDC** and
**0.003478483953903483 Sepolia WETH**, re-enter the password and explicitly choose
**Confirm compatible payment recovery**. Keep the server/page open. Use Check
original payment and independently check the merchant's received payments.
If the operation is still running when recording must begin, leave it open;
do not retry or start another payment. Capture a confirmed result only if both
sides actually verify it. A response error or unknown result remains unresolved.
Full invariants and fixed diagnostic interpretation: [ZK_FLOW.md](ZK_FLOW.md).

## Reserve the last 15 minutes: record, upload and submit

1. Record a short walkthrough using [DEMO_SCRIPT.md](DEMO_SCRIPT.md), within the
   portal's limit. Show public checkout and an existing verified receipt; then
   local wallet, merchant request, explicit fee review and actual current status.
2. If private delivery remains unknown, say it is experimental and settlement
   remains unverified. Show the real proving evidence without calling it payment.
3. Upload and check the video link from a signed-out/private window. Add it and
   genuine screenshots to the portal. Avoid passwords, login codes and backups.
4. Review description and links, then submit before the cutoff. Save the portal's
   confirmation. A saved draft alone is not a submitted project.

No further code is required merely to record the working public flow. The
privacy work can continue after submission; describe only the evidence available
at the time you submit. KYC, commercial fees, email receipts and redesign wait.
