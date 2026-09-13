# Segment 1Z: offline security, comparison and submission preparation

Completed September 11, 2026. This finishes the currently unblocked review and
submission-preparation work. It does **not** complete private payment settlement
or make every remaining step a user click.

## Work completed

- Added bounded streaming readers to the direct RPC helper, ethers RPC adapter,
  RAILGUN TXID history adapter, POI preflight and actual Axios POI transport.
  Decoded responses are limited to 8 MiB for RPC/history and 1 MiB for POI.
  Oversize and aborted streams are cancelled; tiny chunks do not accumulate
  an unbounded list of retained wrappers.
- Completed the remaining dependency call-path review. Documented the separate
  React Native crypto shim and the URI decoder's CommonJS/ESM and plus-decoding
  incompatibilities. No forced dependency replacement or audit waiver.
- Added `npm run demo:rules`: an executable, deterministic three-case comparison
  using the real approval adapter and explicit SDK doubles. Normal approval
  passes; the unprotected fixture accepts a changed recipient; the protected
  path blocks that same change before any proof/population call.
- Reviewed first-party logging, tracked environment names and 22 evidence
  reports for sensitive-value fields. No findings in that scoped report check;
  no broad secret-scan certification is claimed.
- Prepared CHECK_IN_2.md, SUBMISSION.md, DEMO_RUNBOOK.md and SECURITY_REVIEW.md.
  The public demo and private prototype are distinguished, AI assistance is
  disclosed, and sponsor targets are tied to actual requirements.

## Validation

From `privacy/`, `npm test` passed **132 tests**. From `checkout/`, `npm test`
passed **38 tests**. After refining the streaming buffer and adding 70,000 tiny
chunks to the regression case, **23 focused transport/runtime tests** passed:

```sh
node --test test/response-limit.test.mjs test/poi-transport.test.mjs test/txid-transport.test.mjs test/rpc-transport.test.mjs test/runtime.test.mjs test/rpc-retry.test.mjs
npm run demo:rules
```

The initial concurrent-RPC test used a JSON-only fetch double; it was updated
to a real Response object to exercise the streaming reader. All final tests
pass. HTTP replies are controlled fixtures, not live service responses. The
five new limit tests cover exact size, UTF-8 splitting, tiny chunks, misleading
headers, cancellation, oversized direct RPC without retry, and the actual
Axios fetch integration. Existing SDK GraphQL-query behavior also passes.

No dependency versions, lockfiles, frontend source or Solidity source changed.
The prior successful client/Worker build and real offline wallet/proof checks
remain recorded in Segment 1Y; they were not rerun or relabeled as 1Z results.
The Node/npm versions remain 24.19.0/11.9.0. Foundry was unavailable, so no new
Solidity suite was run. No live RPC, browser, Windows, funded-wallet or full
private-payment validation is claimed.

## What remains and why

| Work | Dependency |
| --- | --- |
| Official deadline, timezone and judging availability | Organizer dashboard or notices; public schedule lookup failed. This can be checked on the phone. |
| Receipt downloads and counter confirmation | McLean's authenticated phone browser. No new transaction is required to view existing data. |
| Actual local login and wallet/history recovery | Trusted computer and user-held accounts/backups. |
| Live sync, fee simulation, deposit and spendability | Trusted runtime, real wallet prompts and explicit transaction approval. |
| Wire private proof, reviewed broadcaster submission, interrupted-attempt handling and settlement | Successful live deposit/spendable-wallet validation plus further integration. |
| Encrypted paid receipts and invoice reconciliation | Verified request-to-payment binding and actual outgoing/incoming wallet evidence; not interchangeable with request history. |
| Final private end-to-end test and video | Working private settlement and personally verified demonstration. |
| Optional extra sponsor integration | New working sponsor feature and its qualification requirements; not added solely to select more prizes. |

The exact deadline could not be verified. No deadline estimate or attendance
commitment was invented. The private gate remains closed; no transaction was
signed or broadcast, no main merge or deployment occurred, and the hosted demo
remains through Segment 1O. KYC and the commercial fee idea remain deferred.
