# Segment 1T: local merchant payment requests

Implemented September 10, 2026, after the workspace recovered. This segment
creates private-recipient requests and lets buyers review them; it does not
submit payments. The hosted mobile demo continues to use public test transfers.

## Behavior

The signed-in merchant chooses **Create payment request**, enters an amount
greater than zero and no more than 10 test USDC, and selects 15 minutes, one hour
or 24 hours. The existing recovery-password flow loads that account’s SDK wallet
inside its isolated local worker. Only that wallet’s private address becomes
the recipient. The worker closes the engine and returns a locked-wallet result.
This action does not require chain RPC, balance scanning or proving artifacts.

The merchant can download a compact JSON file. A signed-in buyer opens it in the
local page and sees the amount, network, full reference, expiry and private
recipient. The page marks expired requests and rejects expired downloads or
imports. File replacement, account changes and unmount invalidate outstanding
reads; no invoice data enters browser storage, URLs, email or analytics.

## Format and boundaries

`shared/private-request.mjs` defines the strict version-1 format specified in
[the saved design](SEGMENT-1T-PLAN.md). A 128-bit random reference identifies each
request. Amounts are decimal integer strings in six-decimal USDC units. Times
are Unix seconds, matching the transfer adapter, unlike millisecond deposit
reviews. Network, chain, token and allowed lifetimes are fixed for Sepolia.

The backend uses `RailgunEngine.decodeAddress/encodeAddress`. The browser uses
the already-locked `@scure/base` 1.2.6 Bech32m implementation and independently
checks prefix, checksum, version, 73-byte layout, canonical case and embedded
chain. Only all-chain or EVM Sepolia addresses are accepted. The direct browser
dependency declaration does not change any resolved dependency version.

Keccak-256 covers a fixed-order JSON body. This is **not a merchant signature**:
anyone can replace a request and recompute its digest. Buyers must confirm the
reference and terms through a trusted merchant channel. Format validation does
not establish merchant ownership, authorization or payment settlement.

Native compact JSON files are bounded to 4 KB; malformed JSON, duplicate keys,
alternate number/escape encodings, unknown fields, changed digest, invalid
amounts and expired or future-created requests fail. Creation permits only the
amount and lifetime alongside the existing authentication/password fields.
The returned request must match the recovered wallet address and submitted
amount/lifetime before the client displays it.

The file contains amount and private receiving address and is **not encrypted**.
It contains no email, account ID, wallet ID, public funding address, access token,
password or secret key. It is neither a receipt nor a spendable-balance claim.
No request increments the public payment counter.

`paymentRequestInvoice` produces a frozen exact-terms snapshot for the existing
prepare-only private-transfer adapter. Replacement terms fail before proving.
The UI does not authorize or invoke that adapter. There is no Pay button or
private signing path added by this segment.

## Validation

The following command passed **17 tests**, including actual SDK workers and
authenticated local HTTP calls with no RPC configuration:

```sh
node --test privacy/test/private-request.test.mjs checkout/test/account-client.test.mjs privacy/test/account-server.test.mjs privacy/test/account-wallets.test.mjs
```

- Eight request tests cover amount/lifetime bounds, browser/Engine address
  parity, schema/expiry/digest changes, native file parsing, immutable reviewed
  terms, session checks, late file reads and client response binding.
- Three HTTP tests include merchant and buyer requests from distinct recovered
  wallets, a new runtime using an encrypted recovery copy, unchanged backup,
  wrong passwords, forged tokens and caller-selected fields.
- Four client and two wallet regressions cover session changes, remote-origin
  refusal, isolation, recovery, overwrite prevention and storage permissions.

The client/Worker build passed using the Sites build helper. Existing large-chunk
and transitive viem `node:worker_threads` warnings remain. The package-lock root
declaration was checked with `npm ls --package-lock-only @scure/base --depth=0`.
This was not a fresh dependency install, audit or full repository test run.
See [the machine-readable report](reports/segment-1t-validation.json).

## Remaining validation

On the trusted local computer, verify merchant download, buyer import, visible
expiry, password clearing and account changes in an actual browser. Node
fixtures do not establish that browser behavior. Keep the private runtime on
loopback and do not tunnel or deploy it.

Live Sepolia/fork preflight, explicit approval/deposit confirmation, private
balance scanning and recovery remain prerequisites for enabling private
payment submission. Then connect reviewed requests to the private-transfer
flow and implement encrypted buyer/merchant receipts and once-only invoice
reconciliation. No transaction was signed or broadcast in this segment; the
default deposit signing gate remains closed. KYC remains deferred.
