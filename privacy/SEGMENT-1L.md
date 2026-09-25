# Segment 1L: local browser onboarding, recovery and KYC deferral

## Scope

The user deferred KYC until testing is complete, followed by a review of the time
remaining before hackathon submission. It may wait until after the contest.
Account results now report `deferred-for-testnet`, `verified: false` and
`requiredForTestnet: false`. KYC is removed from testnet readiness blockers; wallet,
balance and private-payment checks remain. `paymentReady` still returns false.
No request can mark an identity verified or enable production payments.

## Browser flow

The default Honeybee screen is Wallet setup. Privy creates the account and embedded
public wallet. Once signed in, the user can create an independent private wallet,
choose a recovery password, download an encrypted recovery file, verify that saved
file against the stored wallet, or restore it under the same account in a fresh
runtime. The existing public test checkout remains accessible in a separate tab.

Creation returns the encrypted backup to its authenticated creator so a second
password entry is not required just to save the first copy. `verify-backup` loads
the wallet using the submitted backup and checks the installed SDK wallet identity;
it does not replace the stored wallet. Import still rejects another account's
backup and restoration still cannot overwrite an existing wallet.

Password inputs reset on submission. Account changes remount the checkout and
clear wallet/backup/form state. The client checks account continuity before and
after token retrieval and before exposing a response. Unmounting aborts the
browser request; the local operation may already have completed, so users must
refresh status after an unconfirmed create/restore. Writes are never retried
automatically. No wallet recovery secrets are placed in localStorage or URLs.

## Local runtime boundary

The browser connects to a trusted payment runtime on the same test machine.
This runtime receives the recovery password and handles decrypted SDK keys.
The interface states this explicitly. This is a local testnet architecture, not
privacy from the operator or a production browser self-custody implementation.
It does not turn a downloaded backup into an online signing session.

The server binds only `127.0.0.1`. It serves the built checkout and two routes:

| Route | Behavior |
| --- | --- |
| `GET /api/runtime` | Public app ID, local-testnet mode, chain and deferred KYC state; no verification key or credentials. |
| `POST /api/account-wallet` | Authenticated status, create, unlock, backup, verify-backup and restore operations. |

The API requires the exact local Host and Origin, a custom request header, JSON
content type and a signed bearer token. Cross-site requests and preflights are
rejected; no permissive CORS headers or cookie authentication are used. JWT
verification occurs before body processing and again inside the wallet service.
Client-supplied owner selectors and tokens in the body are rejected. Requests are
bounded to 16 KB, headers to 24 KB, and receipt of request bodies to 10 seconds.

Rate limits cap each account at 30 requests/minute and all wallet requests at
90/minute. At most four API requests are admitted concurrently and the underlying
service permits at most two SDK workers. Limits are in memory and reset on restart;
they are not distributed production controls. Error responses omit request data.

All responses disable caching. Static serving is limited to `index.html` and
recognized asset types beneath the build directory, with a canonical-path check.
Source, environment and wallet-backup files are not served. Browser framing is
disabled. The browser client refuses to send credentials to a remote origin.

## Run the local testnet demo

From the repository root, build the checkout:

```sh
cd checkout
npm ci --ignore-scripts
npm run build
```

Then configure the local account runtime in `privacy/`:

```sh
cd ../privacy
npm ci --ignore-scripts
cp .env.example .env.local
```

Set `HONEYBEE_PRIVY_APP_ID` to the real public App ID. Save the app's public ES256
verification key in PEM/SPKI form at the configured
`HONEYBEE_PRIVY_VERIFICATION_KEY_FILE` path. The runtime does not need a Privy app
secret. Keep wallet passwords out of environment variables and command arguments.

Enable email login and embedded Ethereum wallets in Privy, and allow the exact
origin `http://127.0.0.1:4173` (or the chosen port). Then run:

```sh
npm run wallet:web
```

The runtime supplies its public App ID to the browser; the local wallet flow does
not depend on baking an App ID into the checkout bundle. `VITE_PRIVY_CLIENT_ID`
remains optional if using an app client. A plain Vite/static preview does not
expose the account API and cannot create a private wallet.

Use this on the local test machine. Mobile testing of layout and Privy behavior is
still required; this loopback API is not remotely reachable from another device.
Do not put it behind a public tunnel or deploy this key-handling runtime as a web
service. A remote pilot requires its own reviewed transport and custody design.

## Validation and remaining work

All 69 privacy tests and 7 checkout tests passed. The production checkout build
passed, with the existing large-chunk warning. No dependency versions changed.

The automated client/API integration uses disposable locally signed tokens and
real RAILGUN wallet workers. It covers create, encrypted backup, saved-file
verification, cross-account rejection and restoration under a new session/runtime.
HTTP checks cover forged tokens, hostile Host/Origin, missing request headers,
body limits, owner injection, secret-file paths and request limiting. Client
checks reject remote credential destinations and stale-account results.

See `reports/segment-1l-validation.json` for final counts. No browser interaction,
real Privy login, shielding or private-payment settlement is claimed by these
automated tests. No dependencies changed. Previous dependency findings remain
unresolved. The next gate is live authentication and browser recovery validation,
followed by account synchronization, test funding and shielding. KYC is deferred.
