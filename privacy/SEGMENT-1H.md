# Segment 1H: SDK RPC transport

The SDK's default ethers RPC probe timed out in the hosted runtime. Switching
the SDK RPC transport to Node's `fetch` returned a live Sepolia block number.
The deployment checks already use `fetch`. This aligns both paths with the
runtime's configured proxy routing, without disabling TLS or network controls.

The override applies only to the explicitly configured RPC URL. It registers
with both ethers entry points: application ESM and SDK CommonJS. Other ethers
endpoints retain their previous transport. No dependencies changed.

The adapter preserves request bytes and headers, rejects redirects, handles
cancellation, caps each request at 15 seconds and retains ethers' restriction
on insecure authenticated HTTP. Node fetch decodes response compression; the
adapter removes the corresponding encoding and length headers. Error output
uses a fixed code list and never includes endpoint URLs or response payloads.

Use the existing `npm run wallet:sync -- .honeybee/demo` command with
`HONEYBEE_RPC_URL` configured. In proxy-based environments, Node's fetch runtime
must be configured to use the approved proxy (this validation runtime uses
Node 24 and `NODE_USE_ENV_PROXY=1`). The adapter does not create an alternate
network route or bypass proxy permissions.

Validation is recorded in `reports/segment-1h-validation.json`. The automated
suite passes 54 tests, including transport handling, both ethers entry points,
restoration of previous transports, timeout, cancellation and authentication.
An SDK block-number response establishes RPC connectivity, not synchronized
wallet balances. Deployment, POI and both history scan requirements remain in
place; all commands still report `paymentReady: false`.

The final live run passed deployment verification, POI availability and SDK
provider initialization. Its UTXO scan completed; TXID reported `Incomplete`.
The run reached its 90-second deadline with `synchronized: false`. The provider
connection blocker from Segment 1G is resolved. TXID history completion remains
the next issue to diagnose. No funds were moved or transactions broadcast.
