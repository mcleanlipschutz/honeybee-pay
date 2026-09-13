# Segment 1T plan: merchant payment requests

Status: implemented and tested after workspace recovery; see [Segment 1T](SEGMENT-1T.md).
The design and outage notes below preserve the original handoff. Actual browser
and live private-payment validation remain pending.
Prepared September 10, 2026.

The user will not have access to their computer until later. Live wallet
validation remains deferred. Merchant request development does not depend on
that live test, so this is the next independent build task.

At the original handoff, the coding workspace disconnected while a patch was being applied. The tool
reported environment_offline, and a subsequent execution attempt also failed.
At that point no Segment 1T implementation had been pushed or tested; the
handoff commit saved only the design. The workspace was subsequently restored,
its clean tree reconciled with GitHub, and implementation completed.

## Merchant and buyer flow

1. In the local wallet interface, the signed-in merchant chooses Create payment
   request, enters the test-USDC amount and selects a 15-minute, one-hour or
   24-hour expiry.
2. The existing isolated account worker recovers that authenticated account's
   wallet using the local recovery-password flow. The server derives the private
   recipient from that wallet; the caller cannot choose a replacement recipient.
3. The interface shows amount, test network, expiry, full request reference and
   private receiving address. The merchant can download a compact JSON request.
4. The buyer opens the file in the local interface and reviews those exact terms.
   Importing or reviewing a file does not sign, submit or authorize a payment.
5. The future private-payment adapter consumes an immutable snapshot of the
   reviewed request. Execution, encrypted receipts and invoice reconciliation
   remain separate steps after live wallet validation.

Use a request file for this first segment. A production merchant link or QR flow
can be added when the private checkout has a usable remote architecture. Do not
publish the local key-handling service to make the file shareable.

## Request format

| Field | Rule |
| --- | --- |
| version | Exactly 1 |
| kind | honeybee-private-payment-request |
| id | Server-generated hb_ plus 16 random bytes encoded as lowercase hex |
| network | Ethereum_Sepolia |
| chainId | 11155111 |
| token | 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 |
| decimals | Exactly 6 |
| recipient | Canonical RAILGUN v1 private address from the authenticated merchant wallet |
| amountUnits | Canonical decimal integer string, 1 through 10000000 inclusive |
| createdAt | Server timestamp in whole Unix seconds |
| expiresAt | createdAt plus exactly 900, 3600 or 86400 seconds |
| digest | Keccak-256 of the fixed-order JSON body excluding digest |

Use seconds here because privacy/src/private-transfer.mjs already expects an
invoice expiry in seconds. Deposit reviews and gas quotes use milliseconds;
never mix their timestamp units.

Validate the RAILGUN address checksum, prefix, version, exact decoded length and
network. Accept all-chain addresses or EVM Sepolia addresses; reject mainnet or
another chain. The server uses the installed Engine decoder. The browser must
independently validate the same layout and be covered by Engine-parity tests.

Reject unknown fields, unexpected network/token, excessive or malformed amounts,
changed digests, unsupported lifetimes, future-created timestamps beyond the
small clock-skew allowance, and expired requests. Keep native files under 4 KB.
Native compact JSON should reject duplicate-key/ambiguous encodings.

The digest identifies the exact terms and catches accidental alteration. It is
not a merchant signature, proof of identity, proof of payment or an onchain
authorization. A replacement file with a recomputed digest can claim another
recipient. Buyers must receive the request through a trusted merchant channel
and confirm its reference and terms. Do not describe a valid checksum as a
verified merchant.

## Implementation map

- shared/private-request.mjs: portable schema, canonical body, amount parsing,
  compact-file serialization, validation and immutable transfer-adapter snapshot.
  Inject each caller's existing hash and recipient-decoder implementation.
- privacy/src/account-invoice.mjs: amount/lifetime input checks, server-generated
  reference/timestamps, canonical SDK address validation, account-wallet binding.
- privacy/src/account-wallets.mjs: allow invoice-create with only amount,
  lifetimeSeconds and the existing password/token fields. Reject owner/path/
  recipient/token/network/ID/timestamp selectors. This action needs no chain RPC.
- privacy/src/account-wallet-worker.mjs: create the request from the recovered
  wallet, stop the engine and return the locked-wallet readiness result.
- privacy/src/account-server.mjs: expose local privateRequestsEnabled capability;
  leave signing and spendability flags disabled.
- checkout/src/private-request.mjs: independent browser validation and file
  adapter. The installed @scure/base 1.2.6 supplies Bech32m; declare it as a
  direct dependency if used, preserving the already locked version/integrity.
- checkout/src/account-client.mjs: validate returned request amount/lifetime and
  exact recipient against the returned authenticated wallet. Discard late
  account-change responses.
- checkout/src/PrivateWalletPanel.jsx and a small request-review component:
  merchant creation/download and buyer import/review, with expiry feedback,
  account-change clearing and safe filenames. No active Pay button yet.

The existing npm lock contains @scure/base 1.2.6. An offline npm metadata lookup
failed with ENOTCACHED before the workspace disconnected. No dependency update
was completed or verified. Inspect both package manifests and locks before
resuming; do not assume the interrupted patch applied atomically.

## Privacy and product wording

The file contains the requested amount and private receiving address, so share it
only with the intended buyer. It must contain no email, login token, account ID,
public funding address, private wallet ID, recovery password or secret key.
Do not put invoice contents in query strings, analytics or server access logs.
Do not claim the exported file is encrypted.

Label it Payment request and Test USDC. Display its reference, amount and expiry.
State that private payment submission is still in development. It is not a
receipt, spendable balance or completed merchant transaction, and it must never
increment the public payment count.

For this local test segment, reuse the current recovery-password boundary rather
than introducing a new wallet custody model. The intended production merchant
flow remains simpler than this trusted local test setup. KYC stays deferred.

## Required validation before calling Segment 1T complete

- [x] Actual authenticated service creates a request using the account's recovered
      SDK wallet without requiring an RPC configuration.
- [x] Separate accounts produce distinct recipients; a wrong password, forged
      login or injected selector cannot create a request for another account.
- [x] Restart/recovery produces the same recipient with a new unpredictable
      request reference; request generation does not overwrite the backup.
- [x] Browser and SDK decoders agree on valid all-chain/Sepolia addresses and
      reject altered checksums, incorrect lengths, versions and other networks.
- [x] Amount, expiry, token, network, extra-field and recomputed-digest tampering
      tests distinguish checksum integrity from actual merchant authentication.
- [x] File bounds, duplicate keys, malformed JSON and expired imports fail safely.
- [x] The adapter receives exact immutable terms and rejects changes after review.
- [x] Controlled reader/client tests discard late file/API responses after account changes.
- [ ] Confirm actual browser request clearing, file selection and downloads across sign-out.
- [x] Downloaded files omit secrets and account identifiers.
- [x] Focused account/API/client regressions and the checkout build pass.
- [x] Record actual browser QA separately; do not claim it from Node fixtures.
- [x] Update TEST_CHECKLIST.md, the build log and a truthful validation report.

Only the recorded automated checks are marked passed. Signing, publishing,
merging and private-payment counting are not authorized by a passing request test.

## Resume procedure

Restore the coding workspace connection, inspect its working tree for partial
patches, and reconcile it with the latest draft-branch tree before editing.
Reuse the existing repository and dependencies. Finish the request implementation
and tests above; the user's later computer access is needed for local wallet
validation, not for resuming this coding task.
