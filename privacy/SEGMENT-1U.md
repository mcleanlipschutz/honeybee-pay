# Segment 1U: encrypted local merchant request history

Implemented September 10, 2026. Merchants can reopen saved payment requests
after closing the page or restarting the local runtime. This extends Segment 1T;
private payment signing and settlement remain disabled.

## Merchant flow

Creating a request saves its exact terms before returning success. **Open request
history** uses the same account login and recovery password to reopen saved
requests. The page lists ten at a time, shows each reference and creation date,
and labels requests active or expired. Selecting one shows the full amount,
network, expiry and private recipient. Only active requests can be downloaded
for sharing. Historical viewing never bypasses the current-time validator.

Payment status is explicitly **not checked**. A saved request is not a receipt,
an unpaid-balance assertion or evidence of a completed private payment. It does
not increase the homepage transaction count. The application has no method to
mark a request paid or reconcile it against settlement in this segment.

The page keeps decrypted history in memory and clears it on close, sign-out or
another wallet operation. It does not place request terms in localStorage,
URLs, email or analytics. The merchant's downloaded individual request remains
unencrypted as specified in Segment 1T.

## Storage and authentication

`invoice-history` accepts only the existing password and login token fields.
`invoice-create` retains the narrow amount/lifetime input. Neither accepts an
account, recipient, file path, history payload or encryption key from HTTP.
The isolated account worker recovers the account’s existing wallet and holds its
per-account lock while reading or appending history. It stops the engine and
returns a locked-wallet response. No chain RPC or proving artifacts are needed.

`merchant-requests.v1.json` lives inside the private account directory. It uses
AES-256-GCM with a 16-byte authentication tag, fresh 12-byte IV and fresh 32-byte
salt for each rewrite. HKDF-SHA256 derives a dedicated key from the recovered
wallet root with a format/version/account-specific context; the same context
is authenticated as additional data. It does not reuse the wallet database key
or expose the root, password or account ID in the file. The implementation uses
the [Node crypto APIs](https://nodejs.org/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen).

Derived key and plaintext byte buffers are cleared after use. JavaScript strings
and SDK wallet material cannot be reliably erased; the isolated worker exits
after the operation. The trusted local runtime necessarily sees the decrypted
history and wallet material during use.

The envelope is versioned and has a fixed schema. Decrypted history revalidates
every request’s digest, address, fixed network/token, amount, timestamp and
recipient against the recovered wallet. Expired requests are allowed only in
this historical view. Duplicate IDs, unknown fields, invented payment status,
wrong account/root/address or changed ciphertext are rejected.

Reads are bounded to 256 KiB and the list to 128 requests. Existing records are
never automatically discarded to make room. Files and their directory must be
canonical and private; symlinks, multiple hard links, unsafe POSIX permissions
and ownership mismatches fail. A missing history file supports wallets created
before this feature. Corrupt existing files are never treated as empty.

Append writes a unique exclusive 0600 temporary file, syncs it, renames it over
the prior history and syncs the directory on POSIX. A pre-rename interruption
preserves the previous file. A lost response after replacement can leave a saved
request; the client tells the merchant to reopen history before trying again.
Appending the same unexpired request again is idempotent, while a conflicting
reference is rejected. HTTP creation itself still generates a new random ID.

## Validation

**24 focused tests passed:**

```sh
node --test privacy/test/request-history.test.mjs privacy/test/private-request.test.mjs privacy/test/account-server.test.mjs checkout/test/account-client.test.mjs
```

Nine new history tests cover reopening, randomized encryption, duplicate records,
cross-account/root/address isolation, corruption and file bounds, unsafe files,
interrupted writes, saves completed before a lost response, expired history,
capacity and client rejection of misleading results. They passed again after
the final bounded-read change. Eight request tests and four account-client
regressions pass. Three HTTP tests include actual SDK wallets, saving history
before response, reopening through a new server/login session, wrong-password
and selector rejection, and absence of history from password-free status calls.

The checkout client/Worker build passed. Existing large-chunk and transitive viem
`node:worker_threads` warnings remain. This was not a full repository test run,
dependency audit, browser test or actual power-loss simulation. See the
[validation report](reports/segment-1u-validation.json).

## Remaining work and limits

History belongs to this local installation. The wallet recovery backup contains
the wallet root, not request history. Restoring the wallet alone on another
installation yields no historical requests. Encrypted history export/restore,
capacity management and import of pre-feature requests remain future work.

File size and timing remain visible. Encryption does not detect deletion or
replacement with an older valid file by the local filesystem owner, and a
missing file cannot be distinguished from a wallet that never saved history.
This store must not be used as an anti-replay or financial settlement ledger.
Independent payment verification and once-only invoice reconciliation remain
separate requirements for private receipts.

Actual browser history/download/clearing, Windows behavior and crash/power-loss
durability remain unverified. Live Sepolia/fork preflight, deposit confirmation
and spendable private-balance verification are still required before connecting
private payment submission. The runtime stays on loopback; no hosted deployment
changed, no user transaction was signed or broadcast, and KYC remains deferred.
