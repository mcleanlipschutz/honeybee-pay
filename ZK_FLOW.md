# Honeybee private-payment test

Updated September 13, 2026. This is the current Windows handoff for the ZK flow
on `codex/privacy-segment-1a`. It supersedes the earlier instructions that kept
deposit signing disabled. The public hosted site remains a separate public
payment demo; this flow runs at **http://127.0.0.1:4173** on the trusted computer.

The code now connects account wallets, real RAILGUN transfer/POI proving,
explicit buyer confirmation, broadcaster submission, an encrypted attempt
journal, and buyer/merchant receipt verification. **A funded end-to-end private
payment has not yet been validated.** A real 01x03 synthetic proof and tamper
checks pass; the deployed Sepolia verifier key matches. Broadcaster discovery
timed out from the development environment. Check that connection on the laptop
before depositing test assets. Do not describe an offline proof as settlement.

## 1. Update and check the broadcaster

Stop the local server with **Ctrl+C** in its original PowerShell window. Keep
that window so any account-directory environment setting survives. If prompted
`Terminate batch job (Y/N)?`, enter `Y`.

Paste only these commands, without `PS ...>` prompts or sample output:

```powershell
cd "C:\Users\McLean Lipschutz\honeybee-pay-windows\privacy"
git pull --ff-only
npm.cmd ci --ignore-scripts
npm.cmd run artifacts:transfer
npm.cmd run broadcaster:preflight
```

Run each command after the preceding one finishes successfully. The six added
proving files are about 29 MB uncompressed and are checked against pinned
integrity hashes. Keep the original three files from `artifacts:prepare` too.
If those were removed, run `npm.cmd run artifacts:prepare` again.

The broadcaster check first prints **`private-broadcaster-checking`**, then a
final result within about 95 seconds. It opens no wallet and sends no payment.
Look for **`private-broadcaster-ready`**. If it instead says
**`private-broadcaster-unavailable`**, report that result and stop before funding.
The failure includes a fixed stage and reason; a silent or early worker exit
cannot count as successful discovery. Leave PowerShell untouched until its
prompt returns; no extra command is required after 95 seconds. Share the complete
final JSON, including its `diagnostic` object. Its peak counts distinguish
discovered peers, authenticated peer connections, advertised Waku service
protocols, configured topics and eligible Sepolia/test-USDC fee offers.
`clientStartedObserved` and configured topics do not prove a subscription is
healthy; the SDK can report startup after a caught subscription error. Fixed
SDK event/failure labels and fee rejection counters are included to distinguish
that case. Counts and debug labels never authorize payment or bypass a failed
discovery. A raw TCP reachability result alone is not a Waku handshake or fee quote.
TLS, POI requirements and private submission are not bypassed on failure.
`paymentReady:false` in this diagnostic is expected: discovery alone does not
authorize spending or establish a funded wallet.

## 2. Build and reopen the local page

After the broadcaster check succeeds:

```powershell
cd ..\checkout
npm.cmd run build
cd ..\privacy
npm.cmd run wallet:web
```

Leave this window running. Open **http://127.0.0.1:4173** in the browser and
refresh with Ctrl+F5. Sign in as the buyer. Choose **Wallet → Check my wallet**
and verify that the existing private wallet opens with its recovery password.
Do not create a replacement wallet or alter the recovery directory.

## 3. Make one small test deposit

Use test USDC and Sepolia ETH only. A convenient first test is a **2-test-USDC
deposit**, then a **1-test-USDC merchant request** with a **0.10-test-USDC maximum
broadcaster fee**. Confirm the app's actual fees before approving anything.

1. In Wallet, open **Test deposit tools → Review test deposit**.
2. Enter `2.00` and the buyer's recovery password. Review the public funding
   address, private receiving address, protocol fee and expected received amount.
3. Choose **Check network fee**. If the primary button says **Switch to Sepolia**,
   use it, then refresh the fee check.
4. If an allowance is required, choose **Approve exactly 2 test USDC** and inspect
   the separate wallet confirmation. This approval does not deposit funds.
5. Choose **Check original transaction**, or use **Deposit activity** if the
   review expired, until the status is `approval-confirmed`.
6. Refresh the network fee. Confirm the separate **2-test-USDC deposit** in the
   wallet. Check its original transaction until `deposit-confirmed`.
7. Choose **Sync private balance**. Funds must appear as spendable private USDC
   before proceeding. Confirmation alone does not establish POI eligibility.

The public deposit reveals its funding address, token, amount and timing. The
private transfer later uses a broadcaster rather than the buyer's public wallet.
Do not repeat an uncertain deposit; reconcile its saved original attempt.

## 4. Create and pay the merchant request

1. Sign in as the separate merchant account. Choose **Wallet → Check my wallet**.
2. Under **Request payment**, create a `1.00`-test-USDC request with enough time
   for the test, for example 24 hours. Download its `.json` file.
3. Sign in as buyer, check the buyer wallet, and choose **Pay a request**.
4. Open the merchant's request file. Compare the reference, receiving address
   and amount through your trusted merchant channel. The file is not identity
   verification and must not be edited to change its expiry.
5. Enter a maximum broadcaster fee, initially `0.10`, and the buyer's recovery
   password. Choose **Check total and fee**. This does not create or send a payment.
6. Review the actual merchant amount, broadcaster fee and total. Enter the
   recovery password again and choose **Confirm private payment** once.
7. Keep the page and local server open while the worker generates the real
   proof, verifies it against the deployed contract, and sends it through Waku.
   The operation has a 15-minute outer limit and stops on expired authorization.
8. Choose **Check original payment**. This refreshes wallet history, completes
   outgoing protocol POI work, and verifies the exact calldata, nullifiers,
   encrypted outputs and canonical transaction receipt. It never sends another
   payment. Use **Saved private payments** after a reload or connection loss.

The broadcaster's returned hash starts as an unverified candidate. Recovery can
find the real transaction from the original nullifiers, including a gas-repriced
transaction with a different hash but exactly the same authorized proof.

## 5. Verify the merchant receipt

Sign in as merchant and choose **Request payment → Check received private
payments**. Enter the merchant's recovery password. A receipt requires the
merchant wallet to decrypt the exact token amount and encrypted request memo,
validate POI, and match the confirmed protocol transaction. Public USDC transfers,
shield deposits and matching text alone cannot create a private receipt.

Record a successful test only when the buyer sees the verified original payment
and the merchant sees **Received 1 test USDC privately** for the same request and
transaction. At least two blocks are required; these are testnet confirmations,
not an irreversible-finality claim. A receipt does not prove delivery of goods.

## Recovery and limits

- A delivered proof has no onchain expiry. Request/quote expiry prevents this
  app from initiating a late send, but cannot revoke a proof already delivered.
  Pending, unknown and reverted attempts block new private payments until the
  original authorization is resolved. Do not issue a replacement request/payment
  to work around that block. The app has no same-nullifier cancellation UI yet.
- The current review supports one input note and two or three outputs. More
  complex note sets fail instead of downloading unreviewed circuits. Requests
  are capped at 10 test USDC and the approved broadcaster fee at 1 test USDC.
- The encrypted local payment journal holds up to 16 attempted payments. Keep
  the account storage intact. Wallet recovery and merchant-history backups do
  not include this journal. Clearing storage or restoring an old directory is
  not evidence that an earlier payment never happened.
- A missing merchant receipt may mean confirmation/POI is incomplete or the
  payment used an unsupported external-client shape. Recheck the original buyer
  attempt and private balance; do not send again merely because a receipt is absent.
- Privy login, local storage, RPC, RAILGUN history/POI services and broadcasters
  remain availability dependencies. Vendor-independent exit and unshield recovery
  have not been validated. Keep this experiment to test assets.

## Evidence and remaining gate

- A real disposable unfunded account scan passed after the final prover/POI
  changes in 97 seconds, with both histories complete and zero spendable private
  test USDC; recovery passed at 98 seconds. Its check time was
  `2026-09-13T10:02:23.177Z`, at finalized block `0xb273fd`, hash
  `0x5aa15e5470d10e83ec485c2692d161832fc335e49a6babb5dc0f00a0db98a855`.
  The preceding attempt timed out at the RPC deployment check and still
  recovered. Neither run establishes a funded private payment.
- The real 01x03 synthetic proof passed verification and all four tamper cases.
- Its key matched Sepolia's reviewed deployment at finalized block `0xb27368`,
  hash `0xb21e8cb70fcf66f45cee8d17889dfd0ff1d23afd56cd624b7dbb0f48a5915f41`.
- Ten private-payment integration/security tests use clearly labeled SDK/RPC/
  broadcaster doubles. Thirty-nine checkout tests passed, including fresh
  deposit simulation, wallet confirmation, duplicate prevention and receipts.
- A 37-test focused private-runtime/API regression run passed before the final
  independent-review fixes; the ten payment tests were rerun after those fixes.
- The final 17 checkout client/submission tests, production client/server build,
  and lockfile installation dry run passed. Existing bundle-size and dependency
  peer warnings remain. The private production dependency audit reported five
  low and five moderate findings, with no high or critical findings; this is not
  a security audit. See [the validation report](privacy/reports/zk-flow-validation.json).
- Independent review found and verified fixes for prover/POI startup order,
  untrusted acknowledgement recovery, reverted authorization handling and
  unsupported merchant transaction isolation. This is not an independent audit.
- **Still required:** laptop broadcaster connectivity, actual deposit wallet
  confirmations, a funded private send, outgoing POI completion, merchant receipt
  recognition, and a recovery check after that real transfer.

## CROPS review

Chosen default: retain the pinned RAILGUN protocol and keep account keys/proving
in isolated local workers, with a separately approved public deposit and a
broadcaster for private sends. No new custom privacy contract is introduced.

| Area | Concrete risk | Mitigation and escape path |
| --- | --- | --- |
| Censorship resistance | Privy can deny authentication; the RPC, history service, POI service or broadcaster can prevent progress. | Local frontend/server can be rebuilt and the RPC/POI endpoints are configurable. Waku discovers eligible broadcasters. A complete vendor-independent exit has not been demonstrated. |
| Open visibility | Hosted authentication and service operations are not reproduced by this repo; the hosted frontend is older than the local branch. | The local source, pinned packages, ABIs and commands are available on the draft branch. The public site's limits are identified explicitly. |
| Free licensing | The application/engine/broadcaster packages declare MIT; snarkjs declares GPL-3.0. A full transitive license review is not complete. | Preserve upstream license notices and exact versions. Do not claim every dependency has the application's MIT license. |
| Privacy | Deposits expose funding address, amount and timing; providers can see network metadata; Privy handles sign-in identity. | Private sends use encrypted outputs and memo, a broadcaster, encrypted local records and no sender-address disclosure to the recipient. Neither transaction hashes nor all metadata are hidden. |
| Security | The local computer can access keys while unlocked; protocol upgrades and stablecoin issuer controls remain external powers. | Password-bound recovery, account locks, exact approvals, pinned code/verifier checks, explicit confirmation and pre-send journaling limit this path. Upgrade governance and vendor-independent unshield recovery remain unverified; no real-money readiness is claimed. |

These compromises are bounded to an experimental local Sepolia test. They are
not acceptable evidence of a production-ready custody, privacy or recovery system.
