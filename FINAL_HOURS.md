# Honeybee Pay: final-hours handoff

Updated September 13, 2026. McLean reports eight hours until submission and is
using a phone hotspot at work. This plan uses time from now, not an independently
verified event deadline. Aim to submit within three hours and retain the rest
as a buffer. The organizer portal controls field limits, video length and judging.

## What to demonstrate

Honeybee Pay combines an email-based public USDC checkout with buyer-approved
payment checks and an evolving ZK payment layer. The public test payment has
settled. Private wallet recovery and offline ZK proof checks work; complete
private merchant settlement is still unfinished. A passing POI connection check
does not establish a completed wallet scan or spendable funds.

| Evidence | What it shows | Limit |
| --- | --- | --- |
| Existing 1-USDC Sepolia receipt | An actual public test transfer and receipt lookup | Public transfer; not a private payment or customer adoption |
| Separate buyer/merchant wallet recovery | Account-bound local wallets and encrypted backups | Local runtime; no private settlement |
| Merchant request download/import/history | Reviewable recipient, amount, token, network and expiry | Unpaid request; not a paid receipt |
| `npm.cmd run demo:rules` | Approved proposal accepted; changed recipient rejected by the adapter | Offline SDK doubles; not a live AI exploit or cryptographic proof |
| `npm.cmd run proof:smoke` | Real proof generation/verification and rejected tampering | Synthetic inputs; no transaction or settlement |

## Next twenty minutes

1. In the original PowerShell window, stop the website with Ctrl+C if it is
   running. Keep that window open so its recovery-directory setting survives.
2. Run:

   ```powershell
   cd "C:\Users\McLean Lipschutz\honeybee-pay-windows\privacy"
   git pull --ff-only
   npm.cmd run wallet:web
   ```

   The launcher and wallet subprocess now prefer IPv4. There is no dependency
   reinstall or frontend rebuild for this update.
3. Refresh the local page, sign in as buyer, choose Wallet → Sync private balance
   and make one attempt. Record the actual result. Allow the bounded operation
   to finish. A failure is not a zero balance. Avoid repeated scans during the
   recording; reserve at most twenty minutes for this remaining network gate.
4. The hosted demo is currently restricted to McLean's account. Ask Codex to
   make the existing testnet demo public if judges should open it. After access
   changes, verify the URL in a signed-out/private browser window. Publication
   access does not publish the local wallet database or encrypted backups.

   Hosted URL: https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site

## Recording preparation

- Open the hosted public checkout, the local wallet page, and a second PowerShell
  window for offline demonstrations. Keep the local server's window running.
- In hosted Receipts, expand **Find a transaction by its hash**, paste the hash
  below and choose **Find receipt**. The September 10 transfer may be outside the
  first recent-history page. Open **Download receipt** and confirm it works.

  ```text
  0x3247ad91ac4f8ee5b735dfeb53bad84e1d5e127be53840f62194034e6d00e9a5
  ```

- Show this as a previously completed public test payment. A new transfer is not
  necessary to show the existing receipt. The shared counter is test activity,
  not customers, revenue or an endorsement of security.
- Reopen merchant request history and the buyer's imported request. If the old
  request expired, create a fresh 1-test-USDC request in **Request payment** and
  import the downloaded file through **Pay a request**. Do not edit old JSON to
  change expiry or imply that it was paid.
- In the second PowerShell window:

  ```powershell
  cd "C:\Users\McLean Lipschutz\honeybee-pay-windows\privacy"
  npm.cmd run demo:rules
  npm.cmd run proof:smoke
  ```

  The proof check is offline after the already-prepared artifacts. Two `ERROR: 4`
  messages are expected from invalid-witness checks; judge success from the final
  `offline-joinsplit-proof-check-passed` JSON and successful command exit. If it
  fails on Windows, use the clearly dated recorded proof evidence in the repo
  and describe it as recorded evidence. Never call a failed live run a pass.
- Record only application screens and test output. Pause before entering wallet
  passwords or email codes. Keep recovery-file contents and environment files out
  of the recording.

## Suggested three-minute narration

Check the portal's actual duration limit first; three minutes is a suggested cut.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:20 | Honeybee checkout | “I’m McLean, and my cryptocurrency investigation work led me to Honeybee Pay. I want stablecoin payments to be simple for everyday users, with clear approval controls and better transaction privacy.” |
| 0:20–1:00 | Email wallet and existing 1-USDC receipt | “Privy provides email sign-in and an embedded Ethereum wallet. Here is a completed public test-USDC payment on Sepolia. Honeybee checks the transfer against the reviewed terms and gives both parties a retrievable receipt.” |
| 1:00–1:30 | Three-case rules demo | “This offline comparison starts with approved terms. An unprotected example accepts a substituted recipient. Honeybee’s adapter rejects that same substitution before proof preparation. This control is deterministic application code.” |
| 1:30–2:10 | Local wallet, recovery confirmation and request | “The local privacy prototype has separate account-bound RAILGUN wallets, encrypted recovery files and merchant request history. I tested buyer and merchant recovery and checked that the restored addresses and request terms match.” |
| 2:10–2:35 | Successful proof JSON or dated report | “This is a real offline zero-knowledge proof using synthetic inputs, including checks that reject altered output and witness data. It demonstrates a tested component of the privacy layer, not a settled private payment.” |
| 2:35–3:00 | Current status | “The working payment demo is public. Full private merchant settlement and encrypted paid receipts are still under integration. My next milestone is one complete private payment with recovery. I directed the product and tradeoffs; Codex assisted with implementation and tests, which are recorded in the repository.” |

Use your own words after rehearsal. Be ready to explain why Privy handles the
public wallet, why RAILGUN supplies the privacy protocol, and why approval checks
in the application do not constitute an independently enforced onchain firewall.

## Submit with a buffer

| From now | Task | Completion evidence |
| --- | --- | --- |
| 0–20 minutes | One IPv4-enabled sync attempt; resolve hosted-demo audience | Actual scan result and a signed-out access check after authorization |
| 20–60 minutes | Rehearse the existing payment, request/recovery, rules and proof demonstrations | Chosen screens open; honest narration matches them |
| 1–2 hours | Record, upload and play back the video; choose screenshots | Video link works without your account; no passwords or backup contents appear |
| 2–3 hours | Paste SUBMISSION.md into the organizer's fields, review and submit | Portal confirmation and saved screenshot |
| Remaining time | Correct only demonstrated problems or organizer feedback | Recheck links and confirmed submission; retain upload/deadline buffer |

- [ ] Confirm the portal countdown, video limit, required screenshots and live-judging availability.
- [ ] Use the current source branch, not main alone:
      https://github.com/mcleanlipschutz/honeybee-pay/tree/codex/privacy-segment-1a
- [ ] Copy the description, how-it-is-made and AI-use disclosure from SUBMISSION.md.
- [ ] Verify the exact Privy prize requirements in the portal. It is the existing
      demonstrated sponsor target; do not select unimplemented integrations as completed work.
- [ ] Add the accessible demo/video/source links and required screenshots.
- [ ] State that private settlement is unfinished and private signing is disabled.
- [ ] Submit, wait for confirmation, and save a screenshot. Nothing in this file submits the form.

Keep KYC, commercial fees, email delivery, QR links and additional sponsor
integrations outside this deadline pass. Preserve the working source and existing
test evidence. The current stable prototype is the submission foundation.
