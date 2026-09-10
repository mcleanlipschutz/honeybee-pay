# Segment 1I: TXID history transport

The TXID history client failed while establishing its proxy tunnel, before it
could retrieve history. Its GraphQL Mesh fetch implementation is separate from
the ethers RPC transport fixed in Segment 1H.

The new adapter routes only the SDK's existing Sepolia history endpoint through
Node fetch with the runtime's configured proxy. It preserves the SDK's source,
schema, queries, pagination, cursor and transaction formatter. It preserves
GraphQL error responses rather than treating them as empty history. Requests
have cancellation, a 15-second deadline and no automatic redirects.

Wallet SDK 10.9.0 exposes no public history transport setter. The adapter wraps
its generated `getMeshOptions` function and replaces only `fetchFn`, before any
mesh is initialized. This internal integration is version-guarded and must be
reviewed when upgrading the wallet SDK. It does not edit installed dependencies.

An isolated live query using the installed SDK retrieved 3,709 TXID records after
the change. The automated suite passes 58 tests, including the SDK's real query
path with a controlled response, cursor preservation, endpoint scoping and
GraphQL error preservation. Live scan results are recorded separately in
`reports/segment-1i-validation.json`.

Transient read-only RPC failures now receive at most three attempts, with bounded
backoff. RPC protocol errors, wrong chain, changed deployment and changed circuit
checks are not relaxed. The overall synchronization deadline remains 90 seconds.

Use the existing wallet sync command. Deployment verification, POI validation,
Merkle-tree checks and the requirement for both history scans remain enabled.
Successful history synchronization does not establish spendable funds, a
merchant receipt or payment readiness. The validation wallets are disposable,
unfunded demo identities and are removed after the run.

Full synchronization remains unverified. Two attempts failed deployment preflight
with transient RPC errors. After adding bounded retries, automatic approval
review rejected the full sync because the external POI service could receive
wallet-derived transaction or address data without explicit authorization for
that payload and destination. No further sync was attempted after rejection.
User approval for SDK POI requests to `https://ppoi.fdi.network` is required to
complete this validation with disposable, unfunded demo wallets. The isolated
history download does not perform wallet POI validation.

Update: POI requests were subsequently approved. See [Segment 1J](SEGMENT-1J.md)
for the approved attempt and the separate RPC approval requirement.
