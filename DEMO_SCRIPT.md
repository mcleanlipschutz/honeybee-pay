# Honeybee Pay: recording and judging

Prepared September 13, 2026. Suggested three-minute cut; obey the portal's actual
limit. This script uses recorded proof evidence and the known public transfer.
It does not claim that an end-to-end private payment has passed.

## Open these screens before recording

1. [Public Honeybee checkout](https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site).
2. Its existing public Sepolia receipt. Use **Find a transaction by its hash** if
   the September 10 payment is outside recently loaded blocks:

   ```text
   0x3247ad91ac4f8ee5b735dfeb53bad84e1d5e127be53840f62194034e6d00e9a5
   ```

3. Local **http://127.0.0.1:4173**: buyer wallet and a merchant request with verified
   matching terms. A request alone does not prove payment.
4. [Actual proof validation report](privacy/reports/separate-fee-validation.json):
   two synthetic Groth16 proofs verified locally and through the deployed verifier.
5. Current branch README or [status checkpoint](privacy/reports/final-handoff-validation.json).

Do not show environment-file contents, passwords, email codes or recovery JSON.
Keep the server running. Screenshots should show actual application state; do not
construct a paid receipt. If using dated proof output, call it recorded evidence.

## Narration

| Time | Screen | Read or adapt |
| --- | --- | --- |
| 0:00–0:20 | Honeybee home | “I'm McLean, and this is Honeybee Pay. I want everyday stablecoin payments to be easy to use, clear to approve and more private for buyers and merchants.” |
| 0:20–0:55 | Public wallet and receipt | “Privy provides email sign-in and an embedded Ethereum wallet. This is an actual completed public test-USDC payment on Sepolia. Honeybee checks the transfer against the reviewed recipient, amount and token before displaying the receipt.” |
| 0:55–1:25 | Local wallet and request | “The local privacy prototype adds a separate RAILGUN wallet for each account, encrypted recovery and merchant requests. I verified buyer and merchant recovery and checked that the restored addresses and request terms match. Email sign-in alone does not recover the private wallet.” |
| 1:25–2:00 | Deposit review and separate fee | “The buyer reviews the deposit and its exact approval before confirming any funding transaction. Merchant payments use test USDC. Broadcaster fees use separately funded Sepolia WETH because available broadcasters did not accept this USDC token for fees. Funding amounts and addresses are public.” |
| 2:00–2:35 | Proof report | “These are two real Groth16 proofs made with synthetic notes. Both passed local verification and the deployed Sepolia verifier. The payment and fee proofs are bound to the same relay batch; the altered binding was rejected. These checks demonstrate the proving components, not a settled private payment.” |
| 2:35–3:00 | Current status | “The public checkout works. The private attempt generated and checked its proofs, but broadcaster delivery remains unresolved. Recovery is implemented; confirmed private settlement and the matching merchant receipt remain unverified. This is an experimental testnet project. I directed the product and tradeoffs; Codex assisted with implementation and tests documented in the repository.” |

## If the funded private test succeeds before recording

Only after both sides verify the same original payment, replace the final section
with the buyer confirmation and merchant matched receipt. Say: “This test payment
has now been confirmed, and the merchant recovered the receiving note and matched
it to the same request. Here is the transaction reference.” Keep the proof report's
synthetic-input label. One successful test still does not establish production safety.
If only funding succeeds, say “the deposit confirmed” and keep settlement pending.

## Optional rules demonstration

Use a second PowerShell window, without stopping the server:

```powershell
cd "C:\Users\McLean Lipschutz\honeybee-pay-windows\privacy"
```

```powershell
npm.cmd run demo:rules
```

Explain: “An approved proposal passes. An intentionally unprotected fixture accepts
a changed recipient. Honeybee's actual adapter rejects that change before proof
preparation. This is an offline comparison using SDK doubles; it moves no funds.”
Use it only if time allows or a judge asks about the approval controls.

## Judging answers

**Is ZK implemented?** Actual RAILGUN proof generation, verification and private
submission code are integrated. Real synthetic proofs passed local and deployed
verification. A funded private payment is not yet demonstrated by this checkpoint.
Update that last sentence only when buyer and merchant evidence establishes it.

**What did Honeybee build?** The checkout and approval flow, isolated account-wallet
service, recovery/request UX, separate fee funding, batch binding, encrypted attempt
tracking and receipt matching. RAILGUN supplies the privacy protocol and circuits;
Privy supplies authentication and public-wallet infrastructure.

**Why WETH fees when the merchant receives USDC?** The discovered Sepolia broadcaster
accepted the pinned WETH token. Fees and merchant amounts remain distinct and use
separate decimal handling and explicit limits.

**What stays public?** Public checkout transfers and shield deposits expose public
addresses, tokens, amounts and timing. Private transfers still have public chain
transactions and metadata. RPC, POI, history and broadcaster operators are dependencies;
Honeybee does not claim universal anonymity.

**Can it prevent every scam?** No. It checks reviewed terms and rejects altered
proposals. A malicious request the buyer approves can still be harmful. Merchant
identity verification and an independently enforced onchain firewall are not built.

**Who controls recovery?** The local runtime handles private keys and passwords.
Recovery requires the same account, encrypted backup and password. Request history
has a separate backup; the payment journal is not included. Independent unshield
exit and cross-device funded recovery remain unverified.

**Why is the public website different?** It hosts the working public checkout.
Experimental private-wallet operations stay on the trusted local computer and are
shown in the recording; they have not been deployed publicly.

**Is this production ready?** No. It is a testnet prototype with unvalidated funded
paths and third-party dependencies. No security audit or real-money release is claimed.

**Which sponsor integration is working?** Privy email sign-in, embedded wallets and
user-confirmed wallet transfers. Do not call Honeybee's own controls Privy policies
or imply Arc, Chainlink or Graph integrations are implemented.

**What remains after the hackathon?** Complete funded end-to-end and recovery tests,
independent security review, robust exit/recovery, production architecture and
identity/commercial decisions. The transaction-fee business idea is deferred.
