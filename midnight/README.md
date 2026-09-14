<!-- SPDX-License-Identifier: Apache-2.0 -->
# Honeybee Pay — Midnight buildathon

**Milestone M1: a compiling Compact contract and local invoice-approval simulation.**
New work started September 14, 2026, from Honeybee Pay development commit
`cca718ca9fa8c3f58449b7cd4e3be91b19748bf5` on `codex/midnight-wave1`.

Honeybee Pay aims to make merchant payments simple, private and controlled by the
buyer. This first Midnight module checks that an invoice matches the exact terms
the buyer previously approved, without writing those terms into the public ledger.
It is an approval primitive, not a payment engine or proof of settlement.

## Run it

Use Node.js 22+ and the official [Compact toolchain](https://docs.midnight.network/getting-started/installation).
Windows development requires WSL; run the following inside its Linux terminal.

```bash
compact update 0.31.1
cd midnight
npm ci --ignore-scripts
npm run compile
npm test
npm run demo
```

The package pins Compact runtime **0.16.0**, matching compiler **0.31.1**.
The compiler checks its own version and produces two circuits, `approve` and
`consume`, with proving and verifying keys. Compilation verifies that the expected
artifacts are nonempty. Tests refuse stale generated JavaScript. Generated files
are ignored by Git and must be built locally.

If using the official standalone compiler, set `HONEYBEE_COMPACTC` to its executable
path. A Linux build can use the [official compiler release](https://github.com/midnightntwrk/compact/releases/tag/compactc-v0.31.1).
For fast iteration, `npm run compile:fast` skips key generation; it is explicitly
marked as a logic-only build. Run the full command before recording compilation
evidence. Compiler output uses the installed toolchain's cryptographic parameters;
the first full build may take longer.

The demo creates disposable random secrets in memory. It opens no Honeybee wallet,
requires no account or test tokens, sends no transaction, and prints only public
commitments and fixed test results. The sample asset and recipient are synthetic
identifiers, not a funded USDC payment.

## What the contract checks

The owner has a random 32-byte secret. Its domain-separated public hash, bound to
a random instance ID, is sealed during contract initialization. Each state change
checks knowledge of that secret inside the Compact circuit. A witness supplies the
secret; the circuit verifies it. A witness's claim of ownership is never trusted.

`approve` validates an invoice and records a salted commitment to its full typed
contents. `consume` recomputes that commitment, requires a matching approval, and
records its one-time consumption. Both operations require the owner secret.

The commitment binds invoice ID, recipient identifier, asset identifier, chain ID,
exact amount and maximum amount, plus the instance ID and a versioned domain.
Amounts are unsigned 64-bit integer units. Currency decimals and wallet-address
encoding will be defined by the checkout adapter; they are not inferred here.
Changing the amount fails even if the replacement is below the original maximum.

| Public ledger | Private local inputs |
| --- | --- |
| Pseudonymous owner authority and random instance ID | Owner secret |
| Salted approved and consumed commitments | Invoice ID, recipient, asset, chain, amount and ceiling |
| Set sizes and approval/consumption linkage | Fresh 32-byte invoice salt |

The compiler emits zero-knowledge circuits for these checks. **This milestone
tests their generated JavaScript behavior; it has not generated or verified a
Midnight transaction proof, deployed to a network, or settled a payment.** Creating
proving keys is not proof generation. See [validation](VALIDATION.md).

## Privacy and enforcement boundaries

- The public authority links approvals within this contract instance. The same
  commitment appears at approval and consumption. Timing, transaction metadata,
  contract activity and counts remain observable. This is not anonymity.
- Salts and owner secrets must come from a cryptographic random generator.
  The simulator does this. The contract rejects zero salts but cannot prove their
  entropy. Reuse of a salt can weaken privacy.
- One commitment can be consumed once. The owner can explicitly create another
  approval with a new salt, including for the same invoice. There is no global
  invoice-uniqueness registry or payment double-spend protection in this module.
- Anyone can deploy a contract with their own authority. Before integration, the
  checkout must pin the expected contract, owner authority, chain and artifact
  identity; success from an arbitrary instance cannot authorize a payment.
- The simulator's secret lives in process memory. Encrypted private-state storage,
  recovery, cancellation, expiry and an independent security review remain work.
- No Midnight result is currently consumed by Honeybee's payment code. No bridge,
  cross-chain verifier, atomic settlement or native Midnight USDC integration is
  implemented. A public Sepolia transfer remains public even if invoice approval
  is private. Existing RAILGUN settlement remains experimental and unverified.
- An accepted approval must never be displayed as "Paid". A payment receipt must
  come from independent, matching settlement evidence.

## Next milestones

See [BUILDATHON_PLAN.md](BUILDATHON_PLAN.md) for the sequenced work and Wave 1
submission requirements. The immediate next milestone is a real proof round trip
and local/testnet state transition, followed by the checkout connection.

## License and attribution

All newly authored code and documentation in `midnight/` use **Apache-2.0**, as
required for the submitted Midnight functionality. See [LICENSE](LICENSE) and
[NOTICE](NOTICE). Existing Honeybee code retains its current license.

Primary references: [Compact security model](https://docs.midnight.network/compact/smart-contract-security),
[commitment API](https://docs.midnight.network/compact/standard-library/exports),
and the official [counter simulator](https://github.com/midnightntwrk/example-counter/blob/273f083ab36a52407f16ec9a9796d902226e05d6/contract/src/test/counter-simulator.ts).
