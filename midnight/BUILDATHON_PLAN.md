<!-- SPDX-License-Identifier: Apache-2.0 -->
# Midnight buildathon — next build segments

Prepared September 14, 2026. Wave 1 submission closes **September 16, 2026,
15:00 UTC / 11:00 a.m. America/New_York**, confirmed by the AKINDO welcome email.
The [event page](https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG) was read directly.
Its summary points to a binding rules PDF but currently displays a placeholder
`[RULES PDF LINK]`; no separate binding PDF was available in that section.

## Product direction

Extend Honeybee Pay's buyer-controlled merchant checkout with private invoice
authorization on Midnight. Begin with one owner, one merchant invoice, one test
asset and a clear approved/rejected result. The desired end result remains a
simple private merchant payment with a receipt; the first contract establishes
only the invoice-approval component.

Existing foundation: public Sepolia checkout and receipt verification, local
wallet recovery, experimental RAILGUN private-payment work. The last funded
private-payment outcome is unresolved. Recover it through the existing read-only
journal/chain checks before any user-authorized retry; starting this branch is not
permission to create a replacement payment or reuse wallet credentials.

## Sequence and acceptance gates

| Segment | Concrete work | Done when |
| --- | --- | --- |
| M1 — contract foundation | Compact invoice commitment, owner witness authentication, exact-term matching, one-time consumption, Apache-2.0 scope, simulation and documentation | Full compiler completes with both circuit key sets; adversarial tests pass. Implemented in this branch. |
| M2 — real Midnight proof | Pin compatible network/provider versions; run trusted local proof service and isolated test wallet; add encrypted private-state storage and recovery; deploy a disposable contract | Actual proof generation and verification succeed; valid state transition finalizes; invalid/repeated approval is rejected; capture contract and transaction evidence. Not complete. |
| M3 — checkout connection | Define exact invoice/address/asset encoding, bind the expected contract and owner, review/confirm UI, timeout/recovery and truthful status; keep the approval action distinct from money movement | Browser shows the exact approved invoice, rejects an edited one, and never labels approval as payment. Not complete. |
| M4 — settlement and receipts | Select and document the payment rail and its trust boundary; enforce the same approved data at payment execution; verify merchant receipt; test failure/recovery | One test payment reconciles for buyer and merchant; duplicate attempts cannot create unintended payment; public vs private data is demonstrated. Not complete. |
| M5 — Wave 1 evidence | Reproducible README, progress delta, public commit, GitHub `midnightntwrk` topic, short pitch deck and recorded demo | All required materials are accessible, describe only observed results, and are submitted personally by the entrant before the deadline. Not complete. |

M1 is the completed first segment, not completion of the entire Wave 1 entry.
For the near deadline, prioritize M2, a narrow M3 demo and M5. M4 can continue
afterward if honest partial functionality is used in the submission. A compiling
contract clears the stated technical gate only; it does not guarantee eligibility,
judging acceptance or a grant.

## Demonstration checklist

1. Explain the buyer's goal and the invoice details hidden by the Midnight module.
2. Compile the original Compact contract with the pinned toolchain.
3. Show the approved invoice and altered merchant/amount rejection.
4. Show repeat consumption rejection and the public commitment-only ledger fields.
5. Label local simulation, actual ZK proof, network deployment and actual settlement
   separately, using evidence for each completed stage.
6. State remaining work and what was newly built for this Wave.

## Submission requirements found on the event page

- Existing codebases are allowed; Midnight functionality must be newly developed
  or materially extended within the applicable Wave.
- At least one Compact contract must compile. Missing this causes disqualification.
- The submitted new Midnight code and code needed to evaluate it must be public
  under Apache-2.0. Pre-existing code may retain its license.
- Public GitHub repository, explanatory README, `midnightntwrk` GitHub label/topic,
  slide deck, demo/video pitch, and a description of Wave progress are required.
- Team limit is five registered members; every member registers individually.
- Entries must be submitted personally by the entrant or a registered teammate;
  automated entry tools are prohibited. Prepare materials here; the entrant makes
  the final AKINDO submission.
- Only the version submitted by the deadline is judged for that Wave.

These notes record the page requirements; they do not certify personal eligibility
or accept event terms on the user's behalf.

## Later Waves

The published build periods are September 27–October 17 for Wave 2 and
October 27–November 16 for Wave 3. Exact times must be checked in the portal.
Aim for integrated payment/recovery and merchant testing in Wave 2, then usability,
selective receipt disclosure and repeatable reliability evidence in Wave 3.
Record new work per Wave without representing earlier ETHOnline work as new.
