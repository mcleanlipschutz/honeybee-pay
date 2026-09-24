# Honeybee Pay — pre-ZK readiness

September 18, 2026. This is a testnet engineering checkpoint, not a production
security sign-off or a claim that private payments work end to end.

## Corrections completed

- Mobile recovery now scans successive confirmed block ranges and every candidate
  rather than getting stuck on the first 1,000 blocks. Failed reads do not advance
  the cursor. Checks never sign, resend or clear an uncertain payment.
- Midnight invoice v2 binds request expiry as well as the exact approved terms;
  handoff revalidation rejects expired or altered requests. This is not a chain
  clock and is not independent payment authorization.
- Source, pinned runtime and all seven generated artifacts are verified before
  simulator execution or full-build readiness. Proving keys alone are not proofs.
- The official SDK now provides encrypted, account/network/contract/source-bound
  test-state storage. Disposable-secret tests cover backup, restore, reopening,
  wrong passwords, concurrent initialization and non-overwrite. Mobile and real
  proof-transaction wiring are still separate tasks.
- A loopback-only, version-pinned proof service configuration and bounded GET-only
  preflight are ready. It never posts witness data, accepts a remote URL or follows
  redirects. A consolidated offline gate runs the three suites and checkout build.
- The legacy networking peer store now rejects signed records whose payload peer
  differs from the signer (GHSA-vrf4-mx87-p53w). A narrow 11.2.7-based local patch
  preserves its current libp2p API; a synthetic adversarial test exercises the
  actually resolved package. Waku's UUID dependency is pinned to 11.1.1, with an
  actual request-codec round-trip test. No networking or user payment was performed.

## Evidence and limitations

| Gate | Result |
| --- | --- |
| Midnight tests | 25 passed |
| Legacy privacy tests | 211 passed |
| Mobile checkout tests | 72 passed |
| Consolidated regression gate / checkout build | Passed; 308 tests total |
| Full Compact compile / six-scenario demo | Passed |
| Real local proof preflight | Correctly blocked, exit 2: no verified prover |
| Actual Midnight transaction proof | Not generated or verified |
| Midnight deployment / browser connection | Not completed |
| Private merchant settlement | Not verified |

Production dependency audit results on this date: Midnight 0 findings; legacy
privacy 6 low findings through elliptic; checkout 23 moderate findings including
transitive dependents of decode-uri-component and UUID. No high/critical finding
is reported after the local peer-store correction. Local forks are not necessarily
covered by registry advisory matching: the adversarial test is the evidence for
that correction, not a clean audit count. Existing GraphQL peer-dependency and
frontend bundle-size warnings remain. Dependency modernization, network telemetry
inspection and independent review are required before real funds.

## What still blocks the next stage

1. A trusted developer computer must run the prepared local proof service. This
   environment has no Docker/Podman executable. It is unsafe to substitute an
   arbitrary remote prover because private witness data would leave the device.
2. Engineering must connect actual Midnight transaction/proof providers, verify
   a genuine proof using disposable inputs, and reject invalid/repeated inputs.
   The healthy-prover check cannot substitute for that implementation or evidence.
3. For a deployed test, the owner connects an isolated Preview wallet and approves
   the test action. Engineering records finality and pins network, contract,
   authority and artifact identity, then exercises interrupted-proof recovery.
4. Wire the proof outcome into the simple mobile flow while keeping approval and
   payment receipts distinct. Select/validate settlement separately; the existing
   public Sepolia transfer is not made private by a Midnight approval.

The existing public 1 USDC intent was still pending without a transaction hash
when checked on September 18. Its outcome is unknown, not failed. The older
experimental RAILGUN attempt is separate. Neither journal was cleared, overridden
or resubmitted. Neither blocks an isolated, unfunded proof experiment; both must
be reconciled before any corresponding payment retry or funded end-to-end test.

## Reproduce safely

Install the locked packages in `midnight`, `privacy` and `checkout`, then complete
the full Compact build as described in [midnight/README.md](midnight/README.md).
From the repository root:

```bash
node scripts/verify-pre-zk.mjs
node scripts/verify-pre-zk.mjs --with-prover
```

The first command exercises local fixtures and builds the UI. The second also
requires the local prover's health/version/readiness metadata and currently fails
closed. Neither command authenticates, proves, signs, deploys or sends funds.
Full installation may fetch public packages and proving parameters. The compiled
contract and all integration state must use the same source/schema version.

## CROPS review

Chosen default: retain the simple hosted public-testnet wallet; develop Midnight
approval with a local prover and encrypted disposable state, without giving the
agent signing authority or reusing uncertain payment state.

- Censorship resistance: Privy, Sites/API hosting, RPC, token authorities and the
  later Midnight wallet/indexer can block access. Recovery pagination improves
  missing-hash discovery, not provider independence. A fork can replace RPC and
  hosting; independent wallet exit still needs a demonstrated backup/recovery path.
- Open: source, request schema, dependency patches, build scripts and validation
  are inspectable. Hosted authentication/signing is external and not reproduced
  by cloning the repository. The public frontend and separate local privacy
  runtime must not be confused with one fully self-hosted product.
- Free: existing Honeybee code retains MIT; new Midnight work is Apache-2.0. The
  peer-store fork retains upstream license attribution and documents its changes.
  Hosted services retain their own terms; no broader license guarantee is made.
- Privacy: public Sepolia addresses, amounts, counterparties and timing remain
  visible. Auth/RPC/hosts can observe identity and request metadata. Midnight
  commitments still reveal linkage, activity and counts. A local prover avoids
  deliberately disclosing witnesses to a new third party; SDK telemetry and
  real browser behavior have not received a full network audit.
- Security: no new Honeybee spending key, session signer or allowance was added.
  Uncertain attempts stay blocked; exact matching settlement evidence is required.
  State recovery rejects overwrite and context changes. A crashed state lock
  requires review rather than automatic deletion. Client approval checks and
  expiry revalidation are not an on-chain spending firewall. Vendor-independent
  user exit, finality recovery and the local patch still need broader review.

Accepted compromise: bounded testnet iteration, not real-money release. No claim
of completed private settlement, censorship resistance or independent audit.

For only the steps requiring the owner, see [USER-CHECKLIST.md](USER-CHECKLIST.md).
