# Segment 1W: check private funds for a merchant request

Implemented September 10, 2026. This finishes the interrupted request-to-balance
integration. The local buyer can compare an imported merchant request with a
fresh spendable private test-USDC snapshot. Payment fees, proof generation,
submission and settlement are still separate unfinished gates.

## Local flow

Build checkout and start the existing trusted loopback wallet runtime with its
configured Sepolia RPC. Sign in, recover or check the buyer's private wallet,
then open a merchant request file. Under the exact request details, choose
**Check private funds** and enter the recovery password. The input is cleared
on submission. The scan can take up to two minutes.

The result shows whether private funds cover the requested amount, the available
test USDC and any exact shortfall. It expires at the earliest of 60 seconds after
the scan, the merchant request expiry or the authenticated session expiry. It
does not reserve funds or include payment fees. Refreshing requires another
explicit check. There is no automatic retry, proof, signature or payment.

The control appears only when local synchronization is configured and the buyer
has opened their account wallet. Opening another request, clearing the request,
navigation or account changes discard the component and abort its browser
request. An already-running server worker may finish its read-only scan within
the existing bounded timeout; its discarded result cannot enable signing.

## Account and request binding

- The authenticated API accepts only the recovery password and validated request
  for `payment-check`. Caller-supplied wallet selectors, balances, endpoints and
  submission actions are rejected.
- The isolated worker recovers only the authenticated account wallet and uses
  the existing deployment/POI preflight and account-scoped SDK history scan.
  Both histories and that wallet's balance update must complete. Amounts use
  integer token units and the SDK's spendable-only balance selection.
- Request terms are captured before awaiting the scan and revalidated afterward.
  Expiry during scanning, lost sessions and stale or incomplete snapshots fail.
- The client captures the request and already-opened wallet before token lookup.
  It matches the returned wallet, complete exact request, timestamp, scan balance,
  coverage arithmetic and shortfall. The result must keep fees unchecked,
  submission disabled and payment readiness false.
- Balance results stay in page memory and are not written to request history,
  public receipts, analytics or the public payment counter. The unsigned request
  digest still does not authenticate a merchant.

## Validation

From the repository root:

```sh
node --test privacy/test/account-payment-check.test.mjs privacy/test/account-sync.test.mjs privacy/test/private-request.test.mjs privacy/test/account-server.test.mjs checkout/test/account-client.test.mjs
cd checkout
npm run build
```

**27 focused tests passed:** seven payment-check tests, four account-scan tests,
eight request tests, four local HTTP tests and four existing account-client
tests. Actual SDK workers reject unauthorized payment checks before RPC access
and reject a controlled wrong-chain response while preserving wallet recovery.
The HTTP regressions create and restore real SDK wallets. Successful payment
balance checks and SDK scans in this run use controlled responses; no live
funded account was validated.

The client/Worker build passed. Existing large-chunk and Worker externalization
warnings remain. No dependency versions changed and no fresh audit was run.
This was not a full-repository run or a browser interaction test.

## Next gate

Verify actual local sign-in and wallet/history recovery, then live account sync,
deposit simulation and fee limits. Connect and validate the gated deposit UI
before seeking explicit approval for a small test deposit. Confirm its canonical
event, spendability and recovery; then integrate reviewed request-to-proof-to-
settlement, merchant reconciliation and encrypted receipts.

The hosted mobile site remains through Segment 1O. This segment does not merge
to main or deploy the private runtime. KYC remains deferred. No transaction was
signed or broadcast and no complete private merchant payment has settled.
