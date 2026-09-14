<!-- SPDX-License-Identifier: Apache-2.0 -->
# Honeybee Pay — Wave 1 submission material

Prepared September 14, 2026. Copy the prepared description into the event form after reviewing it. The entrant must personally submit. Deadline from the AKINDO welcome email: **September 16, 2026 at 15:00 UTC / 11:00 a.m. Eastern**.

## Project description

Honeybee Pay is a mobile payment wallet designed around email login, a clear balance and four familiar actions: Wallet, Pay, Request and Activity. People scan a QR code or paste a request, review the recipient and total, and tap Pay. The app estimates fees automatically and records interrupted sends so an uncertain payment does not turn into an accidental retry.

The current mobile prototype sends public test USDC on Ethereum Sepolia. It supports receive addresses, shareable payment requests and verified transaction history. It is a mobile web app, with no bank/card funding or real-money support.

Our new Midnight work is an owner-authenticated private invoice-approval contract written in Compact. It commits to the exact invoice terms with a random salt and permits each approval commitment to be consumed once. The contract checks the owner witness, exact recipient, asset, network, amount and maximum. A deterministic adapter maps the mobile request format into the contract's invoice fields.

The Wave 1 implementation fully compiles two circuits and generates their prover/verifier keys. Sixteen contract tests and three mobile-request adapter tests pass against the generated contract and official runtime. The terminal demo shows correct approval, rejection of changed terms and wrong owners, and rejection of repeated consumption. New Midnight code and evaluation materials are Apache-2.0.

This is local simulation. Actual Midnight transaction proofs, test-network deployment, mobile proof submission and private payment settlement remain in progress. A consumed approval is not a payment receipt. Existing ETHOnline checkout and privacy experiments are prior work and are not presented as new Midnight functionality.

## Links

- [Live public test wallet](https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site)
- [Wave 1 source branch](https://github.com/mcleanlipschutz/honeybee-pay/tree/codex/midnight-wave1)
- [Midnight module](https://github.com/mcleanlipschutz/honeybee-pay/tree/codex/midnight-wave1/midnight)
- [Review and midnightntwrk label](https://github.com/mcleanlipschutz/honeybee-pay/pull/2)
- [Event submission](https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG)

Attach the prepared pitch deck and demo video. The video shows slides and actual CLI output, not a recorded phone payment or a real ZK proof. If the portal requires hosted media links instead of file attachments, upload these files from the entrant's account and paste the resulting links. Do not publish personal details or accept terms automatically.

## Wave progress delta

Prior foundation: public test-USDC checkout, receipt verification and separate local recovery/privacy experiments.

New in this Wave: original Apache-2.0 Compact contract; full pinned compilation; owner witness checks; salted invoice commitments; exact-term and one-time consumption checks; deterministic mobile-request encoding; 19 Midnight tests; source/artifact hashes; simplified mobile UI and automatic EIP-1559 fee review; QR scan/request generation; durable public-payment uncertainty recovery; reproducible setup and honest capability boundaries.

Remaining: compatible local proving environment, real proof generation/verification, test deployment, encrypted private-state persistence, browser proof linkage and settlement enforcement. Those are engineering tasks for the next segment, not steps the entrant is expected to code.

## Demonstration script

1. Open the title slide and explain the goal: people should not have to configure blockchain fees to make a payment.
2. Show the four mobile actions and explain scan/paste, review, Pay. State this is a public Sepolia test wallet.
3. Explain the new Compact invoice-approval module and its privacy boundary.
4. Run `npm ci` and `npm run compile` from `midnight/`, then `npm test` and `npm run demo`.
5. Show exact approval, changed merchant/amount rejection, unauthorized owner rejection and repeated consumption rejection.
6. State the result precisely: generated-contract simulation and circuit keys. Real transaction proving and settlement remain next.

The public source must be accessible at the submitted branch/commit. The GitHub default branch may still describe prior work, so use the exact Wave 1 branch link above.
