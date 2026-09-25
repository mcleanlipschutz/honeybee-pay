# Segment 1Q: account-bound test-USDC deposit review

## Implemented boundary

The local private-wallet view now offers **Review test deposit**. A signed-in
account enters its recovery password and a decimal amount up to 10 test USDC.
The public funding address comes from the connected embedded wallet. The private
recipient comes exclusively from the wallet recovered for the authenticated
account. Requests cannot supply another recipient, owner, wallet ID, token,
network, endpoint or transaction.

The isolated worker checks the password before network access, reuses the pinned
Sepolia deployment/circuit and POI preflight, and reads token decimals, public
balance, allowance and the protocol's shield fee at the same finalized block.
It calls the contract's inclusive `getFee`, checks the integer result, and checks
the block again before returning. Missing data, insufficient finalized balance,
wrong decimals, inconsistent fees, changed blocks and expired sessions fail
closed. This is a snapshot, not a current allowance or promise of execution.

The review contains one unsigned ERC-20 shield call to the pinned RAILGUN proxy.
If needed, it also contains a separate unsigned USDC approval for exactly the
deposit amount. Existing sufficient allowance does not generate another approval;
the review does not revoke or change an existing larger allowance. A partial
allowance still produces an exact total allowance, not an increment or unlimited
permission. Both transactions have zero native value and the Sepolia chain ID.

The UI shows public debit, protocol fee, expected private credit, allowance
requirements, funding/destination wallets, and the limits of deposit privacy.
The network fee is explicitly **not estimated**. Reviews expire within five
minutes or when the login expires, whichever is sooner. Account changes discard
late results; a changed funding wallet or expired review hides its terms. Reviews
are kept in component memory only and are not receipts or counter events.

## No signing or settlement in this segment

`shieldSubmissionEnabled` and `submissionEnabled` are false. The API accepts
`shield-review`, not a submit action; the UI has no approval/sign/send handler.
Neither the runtime nor this work signs or broadcasts transactions. There is no
gas estimate, live deposit simulation, mined Shield event, shielded balance, or
new proof of spendability. `paymentReady` and `spendableBalanceVerified` remain
false, and the worker stops its engine before returning a locked-wallet result.

External RPC access was already blocked in this workspace. This segment does
not retry or route around that blocked access and does not relax deployment
checks. Live account scanning and a fork/live deposit preflight remain required
on the trusted local test machine before adding user-confirmed submission.
The key-handling runtime remains bound to loopback and is not published.

## SDK format and recovery

Reviewed installed Wallet SDK 10.9.0 `tx-shield.js`, its shielding tests, Engine
9.6.0 `ShieldNote` / `ShieldNoteERC20`, the V2 ABI, and provider fee serialization.
The adapter uses the same Engine note/address/encryption primitives as the SDK:
a fresh 16-byte note random and 32-byte ephemeral shield key for each review,
then `ShieldNoteERC20.serialize` and the installed ABI's `shield` encoding.
It does not start a network history provider merely to encode an unsigned call.

The ephemeral key is not an account spending key. It is discarded after note
construction, with the local buffer cleared; JavaScript does not guarantee all
intermediate crypto buffers are erased. The isolated worker exits. No password,
mnemonic, viewing key, login token or ephemeral secret is a response field.
The receiver can recover the note using its viewing key and the public shield
ciphertext. The unsigned calldata must not be regenerated between a later
approval and submission, since generation creates a different note each time.

The review digest binds the serialized review for change detection only. It is
not a signature, owner attestation, onchain policy or private-recipient proof.
The browser independently decodes the calldata using viem and checks the exact
token, amount, chain, proxy, public sender and bounded approval. The account-bound
private destination still relies on the trusted local worker and SDK encryption.

## Validation

- Eight deposit tests passed, including real SDK wallet creation, note encryption,
  independent ABI decoding, fresh randomized commitments, exact approvals,
  tampered terms, mainnet/target/value changes, duplicated notes, fee errors,
  reorgs, expiry and browser-client account changes.
- After engine shutdown, a wallet recreated from the same recovery phrase in a
  fresh database decrypts the prepared note and reconstructs its note public key.
  Another account's wallet cannot decrypt it. This is offline note recovery,
  not a live history scan or spendability proof.
- Nine existing focused account/API/sync tests passed, with added real-worker
  deposit checks. Forged tokens, wrong passwords, other accounts and injected
  fields do not reach even the local mock RPC. A correctly authenticated review
  rejects that RPC's mainnet response and preserves the encrypted backup.
- Four checkout-client regression tests passed. Total: 21 focused tests.
- Checkout client and Worker build passed. Existing chunk-size and transitive
  Worker-bundling warnings remain; dependency versions did not change.

Successful chain-state responses in these tests are controlled fixtures, not
live Sepolia evidence. No new contract was written or deployed. No new dependency
audit, browser interaction test or complete repository test run is claimed.

## CROPS record for this change

Chosen default: keep the existing Sepolia/local-runtime architecture, add a
read-only review using existing RAILGUN primitives, and grant no signing power.
ETHSkills root, Ship, CROPS, Security, Testing and relevant frontend guidance
were read before implementation. Existing Vite/Privy architecture is preserved;
Scaffold-ETH-specific scaffolding commands do not apply to this repository.

| Area | Concrete compromise and current control | Remaining user escape limitation |
| --- | --- | --- |
| Access | Privy login, RPC, POI availability, token restrictions and protocol pause/upgrade powers can block use. Trusted startup configuration permits another RPC, but failed checks do not silently fall back. | Recovery currently still requires this authenticated account. Independent vendor-free recovery/exit is not established. |
| Openness | Honeybee's MIT repository includes the local API, UI, ABIs, pins and startup instructions. Engine 9.6.0 is MIT. Privy and hosted services remain external dependencies. | A rebuild/local run is documented; a fully self-hosted replacement for login and all services is not implemented. |
| Privacy | Deposits expose the public wallet, token, amount and timing. The local runtime sees account wallet material; services can observe request metadata. The review adds no shared receipt/counter storage. | Users can abandon the review without signing. This is not operator-blind privacy or a demonstrated unlinkability guarantee. |
| Security | Account-bound encrypted backup, pinned deployment checks, exact unsigned allowance and no submission capability limit this stage. Protocol upgrade/fee changes still matter before any later signature. | Live exit, private transfers and unshielding are not yet integrated. Use test assets only. |

KYC remains deferred. These are bounded testnet compromises, not a production
security review or a claim of resistance to all listed dependencies.

## Next gate

On the trusted local test machine: complete account sync, load a live review,
recheck deployment/fee/token/allowance immediately before signing, simulate the
exact call, estimate and display gas, and explicitly confirm any approval and
shield transaction through the user's public wallet. Confirm the canonical
transaction and matching Shield event, then rescan until the account's balance
is spendable. Handle pending/unknown outcomes without automatic resubmission and
test recovery after restart. Only then proceed to private merchant settlement.
