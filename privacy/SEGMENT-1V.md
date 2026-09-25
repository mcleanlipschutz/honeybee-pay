# Segment 1V: encrypted request-history backup and restore

Implemented September 10, 2026. Merchant request history can now be downloaded
as a separate encrypted backup and restored after recovering the same wallet
on another local installation. No payment signing or settlement is enabled.

## Recovery flow

The signed-in merchant chooses **Back up request history**, enters the recovery
password and downloads `honeybee-request-history.encrypted.json`. Keep it with
the separate wallet recovery file, `honeybee-testnet-recovery.json`, and keep the
password separately. The history backup does not contain the wallet root and
cannot recover funds by itself.

On the destination installation, sign in to the same Honeybee account and restore
the private wallet first. Then choose **Restore request history**, select the
history backup and enter the recovered wallet’s password. The result shows added,
already-saved and total request counts. The wallet is locked again when the
worker returns. No chain RPC, wallet signature or proving artifact is required.

Downloaded individual merchant requests remain unencrypted files intended for
buyers. They are distinct from this encrypted account-history backup.

## Restore semantics

Export reads and validates existing history, then encrypts a fresh snapshot using
the existing account/root-bound AES-GCM format with a new salt and IV. It does
not modify the source file. Empty history can be exported without creating a
local history file.

Restore authenticates and decrypts the imported envelope with the recovered
account wallet, validates every archived request, and reads current local
history. It adds only missing IDs. Identical records are skipped; a repeated
import with no additions does not rewrite the file. A conflicting ID fails
before any write, even when other imported entries could have been added.
Older snapshots cannot remove newer local records. Empty imports do not erase
history. A union exceeding the 128-record test limit is rejected in full.

The existing account lock covers the entire merge. Successful additions use the
same private temporary-file, sync and atomic replacement routine as ordinary
request creation. Corrupt existing state is not automatically reset or replaced
by an imported backup. If saving completes but a response is lost, the merchant
must reopen history before retrying; the client never automatically retries.

Expired requests may be restored for historical viewing. Their original expiry
is retained, and the ordinary current-time validator continues to reject their
use as active request files. Restoring history does not prove payment or
increment the public payment counter.

## API and file boundaries

`invoice-history-export` accepts only the existing password and login fields on
the ordinary wallet API. `invoice-history-restore` accepts the encrypted
`historyBackup` string through `/api/account-history/restore`. That dedicated
route rejects other actions, while the ordinary wallet route rejects restore.
No caller-selected owner, wallet, recipient, directory or key is accepted.

The restore route has a 266240-byte JSON body cap; ordinary wallet operations
retain their 16384-byte cap. Streaming bodies and declared Content-Length are
both bounded. The existing loopback origin/header checks, verified login tokens,
pending-request limit, per-account rate limit and no-store responses apply to
both routes.

`shared/request-history-backup.mjs` validates native compact JSON envelopes up to
262144 bytes. It fixes format, version, cipher, KDF and cryptographic field
lengths, and rejects unknown fields, duplicate keys and alternate encodings.
This browser-side envelope check does not authenticate ciphertext: only the
worker holding the recovered root can decrypt and authenticate its contents.

The client validates returned history against the returned recovered wallet,
requires locked/non-spendable readiness, and checks restore counts and the
digest of the normalized uploaded backup. That digest correlates this restore
response to its input; it is not a merchant signature or payment receipt.
Late file reads and API responses after account changes are discarded.

## Validation

**33 focused tests passed:**

```sh
node --test privacy/test/history-backup.test.mjs privacy/test/request-history.test.mjs privacy/test/private-request.test.mjs privacy/test/account-server.test.mjs checkout/test/account-client.test.mjs
```

- Eight backup tests cover export/recovery, source-file preservation, merge
  idempotence, newer local records, wrong account/root, changed ciphertext,
  conflicting IDs, capacity, expired/empty backups, interrupted writes, envelope
  parsing, late reads and client response correlation.
- Nine history tests and eight request tests provide storage, isolation, expiry,
  immutable-term and corruption regressions.
- Four HTTP tests include actual SDK wallet recovery followed by history restore,
  repeated imports, merchant isolation and the dedicated route’s authentication,
  action restrictions, declared-size and chunked-size limits.
- Four account-client regressions continue to pass.

The client/Worker build passed with existing large-chunk and transitive viem
`node:worker_threads` warnings. No dependency versions changed. No fresh audit or
full repository test run was performed. See the
[validation report](reports/segment-1v-validation.json).

## Remaining live checks

Verify both actual browser downloads, password clearing, account changes during
file selection, and wallet-then-history recovery on the trusted computer. Tests
used separate local directories/runtimes; they do not establish actual
cross-computer, Windows or power-loss behavior.

The local filesystem owner can still delete or roll back an encrypted history
file; backup merging is not independent anti-replay protection or a settlement
ledger. Capacity management and encrypted receipts tied to verified private
payments remain separate work. Live deposit/preflight/balance validation and
browser integration are required before private signing can be enabled.
The runtime remains on loopback, no hosted deployment changed, no user
transaction was signed or broadcast, and KYC remains deferred.
