# Segment 1F: wallet persistence and Sepolia deployment checks

Honeybee now has a disk-backed wallet database adapter and a read-only check
that ties the configured Sepolia deployment to reviewed runtime bytecode and
the circuit used in Segment 1E.

## Persistent wallet storage

`createWalletDatabase(absoluteDirectory)` uses LevelDOWN 6.1.1, the backend
recommended by the [RAILGUN Node database guide](https://docs.railgun.org/developer-guide/wallet/getting-started/3.-set-up-database).
Pass the returned database to `startRailgunEngine`; `stopRailgunEngine` closes
it and releases its lock. This is compatible with the installed engine's
LevelDOWN interface. The newer abstract-level interface is not substituted.

The adapter requires an absolute path and rejects a symlink at the database
directory. On POSIX, the directory must belong to the current user with mode
0700. Choose a trusted parent directory. LevelDB prevents a second engine from
opening the database concurrently.

`npm run wallet:storage:smoke` creates two disposable wallets in a temporary
database, closes the engine and exits its process, then starts a second process
to reopen both wallets. Incorrect encryption keys must fail. The test checks
database files for the literal seed phrases and encryption key, then deletes
the temporary database. Secrets pass through IPC, not command arguments,
environment variables or logs. No persistent funded wallet is created by this
smoke command.

The SDK encrypts seed records. This does not mean all future synchronized
transaction metadata will be encrypted. Directory permissions and protected
disk storage still matter. The plaintext scan is a targeted regression check,
not a forensic proof that every possible secret representation is absent.
JavaScript strings cannot be reliably zeroed; the disposable processes exit.

The native backend and permission checks were tested on Linux with Node 24.19.0,
including installation with npm lifecycle scripts disabled. Windows ACLs and
other platforms have not been tested. LevelDOWN is an older, deprecated backend
retained here for the current SDK interface; a backend migration remains future
work.

## Sepolia deployment verification

`config/sepolia-deployment.json` pins three addresses and their runtime code
hashes to Sourcify's verified contract records:

| Role | Verified contract | Sourcify runtime match |
| --- | --- | --- |
| Proxy | PausableUpgradableProxy | Exact match |
| Implementation | RailgunSmartWallet | Match, with compiler metadata differences |
| Relay | RelayAdapt | Exact match |

The implementation record has a CBOR compiler-metadata replacement in its
verification results. It is not labeled an exact source-and-metadata match.
All three live runtime bytecodes are compared byte-for-byte by Keccak-256
against the onchain bytecodes recorded by Sourcify, including their metadata.
The pin file records source URLs, match IDs and compiler versions for review.
No upstream Solidity source is copied into this segment.

Run from `privacy/`, after preparing the artifacts:

```sh
npm run artifacts:prepare
HONEYBEE_NETWORK=Ethereum_Sepolia \
HONEYBEE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
npm run deployment:preflight
```

The check uses a finalized block and:

1. Confirms the chain and SDK-configured addresses.
2. Matches the proxy, implementation and relay runtime code hashes.
3. Reads the proxy implementation slot and rejects an unexpected implementation.
4. Checks that the proxy is not paused.
5. Confirms that the relay points to the expected proxy.
6. Compares every coordinate of the onchain 01x02 verification key to the pinned
   local key, including Solidity's Fq2 coordinate ordering.
7. Rechecks the block hash to detect a changed block during inspection.

All state reads use the same block height. Changes to bytecode, implementation,
pause state, relay destination or circuit key stop the check. A legitimate
protocol upgrade therefore requires another review and explicit pin update;
the application does not automatically trust a new implementation.

These results depend on the RPC's view of the chain and Sourcify's verification
records. They establish a deployment snapshot and circuit compatibility, not
an independent contract audit. Re-run before network integration or payment
preparation; the proxy and key can be changed by their administrators.

## Validation and remaining work

The automated suite includes deployment mismatch and concurrent RPC response
tests, alongside database locking and directory-permission checks. The
read-only RPC wrapper now gives each concurrent request its own response ID.
The engine is explicitly pinned to the already installed version 9.6.0 so its
ABI dependency is declared directly.

The storage and live Sepolia checks passed. Full validation results are recorded
in `reports/segment-1f-validation.json`. The existing real proof check remains
a synthetic-note demonstration, not a settled payment.

A clean lockfile install with lifecycle scripts disabled passed all 46 tests,
the fresh-process wallet recovery check and the real proof/tampering check.
npm audit reports 28 findings (0 critical, 10 high, 14 moderate, 4 low), unchanged
from Segment 1E. Those findings and the existing GraphQL peer warnings remain.

Next: initialize application-owned test wallets with a secure key-recovery
workflow, configure network synchronization and POI services, and verify test
token funding before generating an actual test-payment proof. This segment
does not load an engine network, fund wallets, broadcast transactions, merge
the PR or deploy contracts.
