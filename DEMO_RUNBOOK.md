# Honeybee Pay demo and trusted-computer handoff

Prepared September 11, 2026. The public checkout works; private signing remains
disabled. These steps do not enable it. Use test assets and separately controlled
buyer and merchant accounts.

## Things McLean can do on the phone

1. Paste CHECK_IN_2.md into the check-in form, review it and submit it yourself.
2. Confirm the official deadline/timezone, live-judging time, and video length in
   the organizer dashboard. The public event schedule could not be verified.
3. Confirm the public Receipts tab and download a receipt for each account.
   Check the shared counter after sign-out/reload. Record what actually happens;
   no new payment is needed merely to inspect existing evidence.
4. Rehearse the explanation below and choose the prize targets from SUBMISSION.md.
5. Keep both encrypted backup types accessible privately. Do not send wallet
   passwords or recovery files to judges or include them in recordings.

## Suggested three-minute presentation

This is a suggested running time, not a verified organizer video limit.

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:25 | Honeybee checkout | Everyday stablecoin payments should be easy to use and hard to redirect after approval. |
| 0:25–1:05 | Email login, public transfer review, recorded Sepolia receipt | Privy removes manual wallet setup. This demonstrated transaction is public, not private. |
| 1:05–1:40 | `npm run demo:rules` output | An approved proposal passes. An unprotected baseline accepts a changed recipient. Honeybee's adapter blocks that change. This is an offline simulation with SDK doubles. |
| 1:40–2:15 | Local wallet/backup UI if personally verified; recorded proof evidence | Private wallets, recovery and synthetic-note proof checks are implemented. Show the real test report, not a fabricated paid invoice. |
| 2:15–3:00 | Current status and next steps | Full private settlement, encrypted payment receipts and live recovery validation remain. Explain the local runtime and application-control limitations. |

Possible opening: “I'm building Honeybee Pay to make stablecoin payments simpler
for everyday users and merchants. My investigation work made me interested in
preventing payment redirection while improving transaction privacy.”

Possible close: “The public payment flow is working, and I've tested the private
wallet and proving components. My next milestone is one complete private merchant
payment with recovery and matching receipts.”

Do not claim real customer adoption from the test counter. Do not film an
unprotected real payment or run an attack against any external system.

## Open the reviewed code on Windows

Windows checkpoint: McLean installed Node 24.21.0, npm 11.19.0 and Git
2.55.0.windows.5. The corrected repository cloned successfully; checkout's
38 tests and both build stages passed. Production audits showed 23 moderate
checkout findings and the private install showed 5 low findings. After the path
and fixture fixes, Windows reported 128 passed, 3 skipped and 3 cancelled by
test timeouts. An isolated account-sync rerun also reached its 45-second limit.

If already in the clean Windows checkout, retrieve the test repairs with
`git pull --ff-only`, then run `npm.cmd run test:wallets` from `privacy/` to
retest only the three affected files sequentially. This focused suite has 10
tests; Windows explicitly skips one POSIX-only test. The overall Windows
budgets are 3 minutes for account sync, 6 for account recovery and 8 for the
full HTTP scenario. Each existing application operation retains its original
deadline. Test diagnostics print fixed stage labels and elapsed milliseconds;
they contain no passwords, wallet material or tokens. Require zero failures
and cancellations. The larger budget is not evidence of a passing test.

Dependencies did not change, so reinstalling packages is unnecessary. The full
suite still has 134 tests. Review Windows skips separately; they do not establish
POSIX permission checks or Windows ACL protection. Do not remove runtime guards.

Use an existing clean checkout of `codex/privacy-segment-1a`, or clone it into a
new directory. Preserve any work already on your computer.

```powershell
git clone --branch codex/privacy-segment-1a https://github.com/mcleanlipschutz/honeybee-pay.git honeybee-pay-review
cd honeybee-pay-review
cd checkout
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build
cd ../privacy
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run demo:rules
npm.cmd run engine:smoke
```

The reference environment is Node 24.19.0/npm 11.9.0 on Linux. Windows installation
and native database lock/reopen tests passed; complete account scenarios still
require validation after the timeout adjustments. If installation or a test
fails, retain its redacted error and stop there; do not force dependency upgrades.

For an offline proof check, first ensure pinned artifacts are present. If needed,
`npm run artifacts:prepare` downloads and verifies the pinned public artifacts.
Then run `npm run proof:smoke`. This generates a synthetic-input proof, not a
payment. Expected tamper tests can print two `ERROR: 4` lines before success.

## Local browser and recovery gate

1. Preserve an existing `privacy/.env.local`. If absent, create it from
   `.env.example`. Configure the public Privy App ID and public verification-key
   file, plus the private account-directory path. No app secret or wallet password
   belongs in these settings. Verify email and embedded Ethereum wallets in Privy.
2. Allow the exact local origin, normally `http://127.0.0.1:4173`, in Privy.
3. From `privacy/`, run `npm run wallet:web`. Open the printed loopback URL on
   that same computer. A phone's 127.0.0.1 refers to the phone, not this computer.
4. Sign in as buyer. Verify wallet creation/unlock, password clearing, encrypted
   recovery-file download and saved-file verification. Sign out. Verify the
   merchant account is separate and cannot open the buyer's backup.
5. Create a merchant request, download it, reopen history, export its separate
   encrypted history backup and import the request as buyer. Check expiry and
   account changes. An unsigned request does not authenticate a business.
6. Stop the runtime. Preserve the original account directory. Configure a new
   private directory for the recovery rehearsal. Sign in to the same account,
   recover the wallet first, then restore its history backup. Compare wallet and
   request identities. Never delete the only original or backup copy.
7. Reopen Deposit activity. With signing disabled, an empty list is normal.
   Test real saved attempts only when they exist; do not seed fake transactions.

## Live test gates requiring further integration

| Gate | Required evidence | Stop condition |
| --- | --- | --- |
| Account sync | Correct Sepolia deployment and completed account-specific history scans | Incomplete, stale, wrong-chain or oversized responses |
| Deposit review and fees | Exact token/amount, allowance, recoverable note and successful simulation | Missing or changed terms, fees or simulation results |
| Signing integration | Review completed with the actual browser wallet and durable journal | Current closed gate; do not remove it simply to make a button work |
| Small explicitly approved deposit | Matching canonical transaction/event, spendable private balance, recovery | Unknown outcome, mismatch, reorg or unavailable spendability |
| Private merchant payment | Reviewed broadcaster/fee path, request-bound proof, actual submission and merchant wallet evidence | Proof preparation or a public Shield event alone |
| Private receipts | Reconcile each request once using both authorized wallet views, persist encrypted records | Missing invoice binding, ambiguous history or duplicate assignment |

These last stages are unfinished engineering plus live verification. They are
not all user clicks waiting behind a switch. Once the first live gates pass,
continue that implementation before attempting the final payment test.

For each gate record date, code commit, expected result, actual result and only
the minimum public transaction reference or redacted screenshot. No seeds,
passwords, bearer tokens, RPC credentials or decrypted backups in the evidence.
