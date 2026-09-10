# Honeybee Pay: an account, a wallet, private checkout

Recorded September 10, 2026 from the user's product clarification. This is the
target design; the implementation status below distinguishes what exists today.

## Product decision

Users create their Honeybee profile and wallet inside the app or website. The
primary onboarding path remains in-app wallet creation. The intended experience
is cash-like checkout: add funds, scan a merchant QR code or open an invoice,
review the merchant and amount, approve, and receive a receipt in Honeybee.

Account creation, identity verification (KYC), and transaction privacy are
separate functions. Email login creates an authenticated account; it does not
verify legal identity. Creating a new public wallet does not itself hide payments.

## Target buyer and merchant experience

1. Create a profile. Create or restore that user's embedded wallet inside Honeybee.
2. Complete provider-hosted identity verification for the intended verified-account
   product. Clearly show pending, verified, failed, or expired status. Never infer
   verification from email login or a frontend flag.
3. Set up recovery for the user's private wallet and add funds. Distinguish funds
   available for private spending from public funds or pending shielding.
4. Open a merchant invoice or QR code. Review merchant, token, amount, total fees
   and any funding or privacy delay before authorizing the exact payment.
5. Pay from the shielded balance to the merchant's private receiving address.
   Honeybee prepares the proof and submission through the reviewed wallet flow.
6. Show pending until settlement is independently verified. Both parties get an
   access-controlled receipt for that invoice; the merchant sees information
   needed to reconcile the sale, without access to the buyer's unrelated history.

Merchant onboarding must create an independently controlled merchant wallet and
support invoices, incoming-payment verification, refunds as new authorized
payments, and optional withdrawal. A public merchant address is a withdrawal
destination, not a private receiving address. A live private-payment demo must
use separately controlled buyer and merchant identities; the existing three-role
workspace shares one demo owner and does not demonstrate this boundary.

## Responsibilities and privacy boundaries

| Component | Responsibility | Boundary |
| --- | --- | --- |
| Honeybee profile | Login, preferences and account access | Authenticate every account-scoped operation; never authorize from a client-supplied user ID. |
| Verification provider | Identity collection and verification | Prefer provider-hosted collection; retain a scoped provider reference, status and necessary decision metadata in Honeybee rather than raw identity documents. |
| Embedded wallet | In-app public funding and withdrawal actions | Privy is the current integration; its public transactions remain publicly observable. |
| RAILGUN wallet | Shielded balance, spending approval and private transfers | Separate spending keys and recovery are required; Privy login currently does not create or recover these keys. |
| Invoice and receipt service | Merchant requests, payment status and reconciliation | Bind invoice, recipient, token, amount, chain, expiry and one-use authorization. Limit receipt access to the parties. |

Identity verification can coexist with payment privacy. The verification provider
knows the identity it checks, and Honeybee may know the account-to-wallet or
invoice association it processes. The goal is to minimize those associations and
protect shielded payment details from public observers, not promise anonymity
from every participant. Identity records, identity-document hashes and stable
profile identifiers must not be added to public transaction data.

Deposits and withdrawals cross a public boundary. Timing, amounts, network
metadata and application logs can also weaken privacy. The UX must explain these
limits at funding and withdrawal; a successful proof alone does not prove the
whole application is private. Cash-like describes the intended payment
experience, not offline operation, guaranteed instant settlement or zero fees.

KYC status would gate Honeybee's own features. It would not automatically restrict
an underlying permissionless protocol. RAILGUN proofs do not establish a user's
KYC status. Anonymous eligibility credentials would require a separate design;
no such credential or legal-compliance conclusion is claimed here.

## Next implementation segment

Connect authenticated onboarding to independently owned, recoverable private
wallets before adding a live private-payment button:

- Define the session-to-wallet ownership binding and where proving and signing
  execute. Decide and document who can decrypt keys, view history, authorize
  spending and recover access. Do not expose the existing CLI behind an
  unauthenticated endpoint or derive a spending key from a public login identifier.
- Specify encrypted backup and device-loss recovery for RAILGUN separately from
  Privy recovery. Verify restoration preserves the wallet identity and that another
  account cannot unlock or use it. The current Node/LevelDOWN engine is not a
  browser wallet integration.
- Model account, verification and wallet readiness separately. Configure a real
  verification provider before collecting identity information. Validate signed
  provider events, account binding, replay handling and status freshness on the
  server; a preview must never claim that KYC succeeded.
- Follow with test-only shielding, spendable-balance checks, invoice-bound private
  payment, duplicate-submission protection and merchant receipt verification.
  A submitted transaction hash or public ERC-20 log alone cannot establish a
  successful private merchant payment.

The acceptance gate is a recoverable buyer and a separate merchant account,
rejected cross-account wallet access, truthful verification states, and then a
settled test private payment matching the authorized invoice. Keep the existing
public test checkout labeled public until that private flow is implemented.

## Current implementation

- Implemented: email-login/embedded-wallet checkout code, public Sepolia USDC
  payment review and receipt verification; four payment tests and build passed.
- Implemented separately: encrypted demo-wallet recovery, local RAILGUN proof
  validation and successful read-only Sepolia history synchronization.
- Unfinished: live Privy validation, production user/account service, KYC,
  authenticated private-wallet ownership and recovery, in-app shielding, private
  checkout, merchant reconciliation, and independent payment-policy enforcement.

This decision records the product scope. It adds no identity collection, live
funding, broadcast or deployment. Existing dependency and browser-validation
limitations remain recorded in checkout/README.md.

## Protocol references

- [Privy React setup](https://docs.privy.io/basics/react/setup): embedded-wallet integration.
- [RAILGUN shielding](https://docs.railgun.org/wiki/learn/shielding-tokens): public funding boundary and shielded interactions.
- [RAILGUN unshielding](https://docs.railgun.org/wiki/learn/unshielding-tokens): withdrawals to public addresses.
