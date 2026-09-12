# Segment 1G: recoverable demo workspace and synchronization gate

The application can create, reopen and restore buyer, merchant and attacker
wallets. These are three derived accounts under one owner, for the demo only.
They do not represent independent custody or an independently secured attacker.

## Workspace commands

From `privacy/`, after dependency installation and `npm run artifacts:prepare`:

```sh
npm run wallet -- init .honeybee/demo
npm run wallet -- status .honeybee/demo
npm run wallet -- restore .honeybee/restored .honeybee/demo/root.keystore.json
HONEYBEE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com npm run wallet:sync -- .honeybee/demo
```

Passwords use a hidden terminal prompt, or stdin for automation. New terminal
workspaces require password confirmation. Use 12–256 characters; do not put the
password in shell arguments or environment variables. CLI output includes public
and RAILGUN addresses, not spending keys or seed phrases.

The encrypted ethers keystore uses its standard scrypt parameters (N=131072,
r=8, p=1). Keep a separate copy of `root.keystore.json` and its password; there is
no password reset. The SDK database encryption key is domain-separated from the
root private key. Restoring the backup recreates the same three identities in a
new directory, with history requiring a fresh scan. Existing directories are
never overwritten. A partially failed initialization leaves the encrypted
backup available for restoration into another directory.

Workspace and database directories are private and owner-checked on POSIX.
Parent directories must be trusted. SDK metadata is not guaranteed encrypted;
the directory permission is part of the storage boundary. This is not a hardware
wallet or production key-management system. Keep runtime state under `.honeybee/`.

## Synchronization contract

Sync is Sepolia-only and verifies the pinned deployment and circuit before
loading the SDK network. It checks availability of the configured POI service
(`HONEYBEE_POI_URL`, default `https://ppoi.fdi.network`) before loading wallets.
The POI response is an availability check, not proof that these wallets qualify
to spend. POI requirements remain enabled.

The SDK provider uses a single trusted RPC with weight 2, as required by its
configuration validator. This does not provide independent-provider quorum.
Both matching-chain UTXO and TXID completion callbacks are required. Resolving
the refresh promise or opening a wallet alone cannot mark history complete.

Each sync runs in its own process with a 90-second deadline and bounded shutdown.
It atomically records `sync-status.json` with timestamps, stage, scan states and
deployment evidence. A timeout, interruption or error exits nonzero. A killed
process may leave `sync-running`; that is never a completed result. Run one sync
per workspace at a time. Partial database history may be reused on the next run.
Status files are diagnostic snapshots, not live balance or settlement evidence.
Every command keeps `paymentReady: false`.

## Validation and remaining work

Fresh-process tests cover identity recovery, distinct demo roles, wrong-password
rejection, overwrite protection and encrypted backup restoration. Scan tests
reject unrelated chains and partial completion, invalidate completion on a new
scan, and check the configuration against the installed SDK.

The live run passed deployment and POI checks but failed during SDK provider
loading, before either scan completed. See `reports/segment-1g-validation.json`.
Synchronization, test-token funding, spendable balances and merchant settlement
are therefore still unverified. Resolve provider loading and complete both scans
before beginning a test-asset payment. No transactions were broadcast.

Update: [Segment 1H](SEGMENT-1H.md) resolves SDK provider loading. UTXO history
completed in its live run; TXID history remained incomplete at the deadline.

SDK references: [network providers](https://docs.railgun.org/developer-guide/wallet/getting-started/8.-connect-engine-network-providers)
and [engine startup](https://docs.railgun.org/developer-guide/wallet/getting-started/5.-start-the-railgun-privacy-engine).
