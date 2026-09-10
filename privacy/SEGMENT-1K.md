# Segment 1K: account-bound private wallets and recovery

Historical segment record. [Segment 1L](SEGMENT-1L.md) subsequently adds the
local browser API and marks KYC deferred for the controlled testnet demo.

## Implemented boundary

`createAccountWalletService` is a local Node service API for authenticated wallet
creation, locked status, recovery checks, encrypted-backup export and restoration.
It runs the installed RAILGUN SDK with an independently random wallet root for each
account. Each operation uses a fresh child process; exactly one account is loaded
in that process and the process exits before success is returned.

This is the ownership/recovery portion of the product direction. It does not add
a browser connection, a public HTTP endpoint, KYC, shielding or a payment button.
The existing public test checkout is unchanged.

## Authentication and ownership

- `jose` 6.2.12 verifies ES256 access-token signatures against the application's
  configured public verification key. No token-supplied key or URL is used.
- Checks require the Privy issuer, exact App ID, valid subject and session ID,
  issuance and expiry timestamps, and a maximum one-hour token lifetime. Expired,
  future-issued, wrong-app, wrong-key and identity tokens fail closed.
- Storage is selected only from a hash of the verified issuer, App ID and subject.
  Login-session changes preserve the wallet. App or subject changes do not.
  Requests containing an owner ID, wallet ID, key, directory or verification flag
  are rejected. The account hash is pseudonymous, not anonymous.
- Expiry is rechecked in the worker before key use, before persistence, after SDK
  shutdown and before the parent returns a result. Verification is local; provider
  logout, revocation and denylist changes are not checked online. Key rotation
  requires updating trusted configuration and recreating the service.

## Keys and recovery

The embedded public wallet and this RAILGUN wallet have different keys. The
private root is not derived from an email, account ID, public address or login
token. No shared buyer/merchant mnemonic is used.

The entire recovery payload uses AES-256-GCM with a random nonce and salt, a
16–256-character recovery password, and scrypt N=131072, r=8, p=1. The verified
account binding is authenticated associated data. Submitting the same backup and
correct password under another account fails authentication, including after
copying another account's wallet files. Imported backup sizes and KDF costs are
bounded before decryption. This service does not import the old shared demo-root
backup format.

Recovering after loss of a device requires all three: access to the original
Privy account in the same app, the encrypted Honeybee backup, and its recovery
password. Email login alone cannot recover the RAILGUN key. Forgotten-password
reset, migration to another account/App ID and recovery-factor rotation are not
implemented. A holder of the underlying mnemonic can use that wallet outside
Honeybee; the account binding is an application recovery control, not a protocol
restriction.

The caller must retain the exported encrypted backup separately. Recovery tests
restore it into a fresh storage root and load the same private address and wallet
ID in another process. No operation overwrites an existing wallet directory.

## Execution and custody limits

This is a trusted local-process prototype. Its caller supplies the password; the
child process decrypts the mnemonic and holds SDK spending/viewing capabilities
while running. The host or a compromised process could inspect these secrets.
Process separation reduces accidental cross-account state sharing; it is not a
security boundary against the host administrator. JavaScript secret strings cannot
be reliably zeroed, so workers exit after each operation. Buffers used by the
backup cipher are cleared where practical. No seed or database key is returned
by the service, passed in process arguments, or deliberately logged.

Before web integration, choose and validate a user-device execution path or an
explicitly trusted signing/proving runtime, and build its authenticated transport.
Do not connect a browser password form directly to this module and describe that
as privacy from the operator or as established self-custody.

## Local integration

The host creates a canonical absolute storage directory with mode 0700, normally
under the ignored `.honeybee/` directory. Keep it on a trusted local filesystem;
symlinked roots and account directories are rejected. Backup files must be regular
0600 files with one hard link and are opened without following symlinks. SDK
storage remains subject to its existing metadata and platform limitations.

```js
import { createAccountWalletService } from './src/account-wallets.mjs';

const accounts = await createAccountWalletService({
  directory: accountStorageDirectory,
  appId: configuredPrivyAppId,
  verificationKey: configuredPrivyPublicVerificationKey,
});

// accessToken must come from the authenticated session. Password and backup
// enter through a protected local channel; never put them in a URL or log.
await accounts.execute({ action: 'create', accessToken, password });
const status = await accounts.execute({ action: 'status', accessToken });
const { encryptedBackup } = await accounts.execute({ action: 'backup', accessToken, password });
// A fresh storage root, the same verified account, and the exported backup:
await recoveredAccounts.execute({ action: 'restore', accessToken, password, backup: encryptedBackup });
```

`unlock` checks the backup and loads the SDK wallet; it then closes the engine.
The returned wallet is therefore `locked`, not an enduring signing session.
`create` reports `backup-created`; `restore` reports `restored`; `unlock`/`backup`
report `backup-verified`. A status-only read is not a decryption or balance check.

All responses keep identity verification `not-configured`, `verified: false`,
and `paymentReady: false`. No client input can grant KYC or spending readiness.
Provider-hosted identity collection, signed events, replay protection and status
freshness remain the next identity integration; no identity records are collected.

At most two account workers run in one parent process, each with a 30-second
deadline. A per-account directory lock rejects competing operations. A crash may
leave a lock or an incomplete account directory: stop all writers, preserve any
encrypted backup, and recover into a fresh private root. Locks are never
automatically removed based on age. Distributed rate limiting, crash recovery,
durable revocation and production operational controls remain unimplemented.

## Validation

All 66 privacy tests passed, including six new account/authentication/recovery
tests. The fresh dependency audit reports 28 findings: 10 high, 14 moderate and
4 low, with none attributed to the newly added `jose`. These findings remain
unresolved; the audit is not clean.

Run `node --test test/account-*.test.mjs` from `privacy/` for focused checks;
`npm test` includes them in the privacy suite. Tests generate disposable signing
keys and tokens locally. They exercise actual RAILGUN wallet creation/loading,
but do not establish a successful live Privy login.

See `reports/segment-1k-validation.json` for recorded results and the dependency
audit. The only dependency change is adding pinned `jose`; existing RAILGUN
versions and prior unresolved audit findings are not treated as fixed.

References: [Privy access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens),
[Privy identity tokens](https://docs.privy.io/user-management/users/identity-tokens).
