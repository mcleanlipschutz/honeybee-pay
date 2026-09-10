# Honeybee Pay
Honeybee Pay is an ETHGlobal hackathon project that aims to simplify crypto payments with AI, protect transaction details using zero-knowledge proofs, and block payments that don’t match the user’s approved rules.

## The problem

Crypto is often treated as a trading asset, while everyday payments remain a limited use case in the United States. Paying with crypto can be confusing for ordinary users, and transactions on public blockchains can expose payment amounts and wallet activity. Scams and unauthorized transactions create additional risks, including when AI tools are used to deceive users or manipulate payment instructions. Honeybee Pay aims to address these barriers by making payments easier, protecting transaction privacy, and enforcing the user’s approved payment terms.

## First demo

- The buyer approves 3 seperate transactions of 1 test USDC to send to the merchant wallet. 

- Transaction 1 is successful without issue. transaction 2 is attacked and redirected to the attacker's wallet in an intentionally unprotected demo. transaction 3 is also attacked with the same redirection but is rejected because the recipient differs from the buyer's approval.

- The buyer receives an AI generated message informing them of the detected change of recipient details and that the transaction was blocked.
 
- This first demo will test payment authorization and firewall enforcement; ZK privacy will be developed and tested separately.

## Current status

The development branch now generates and verifies a real RAILGUN zero-knowledge
proof locally using synthetic notes. Checks reject altered output commitments,
bound parameters, recipient inputs and amounts. The transfer adapter and offline
wallet checks are also implemented.

Disk-backed wallet recovery now passes across fresh processes. A read-only
Sepolia check matches the proxy, implementation and relay bytecode to reviewed
source records and confirms that the deployed circuit key matches our proof.

Buyer, merchant and attacker demo wallets can now be initialized and restored
from one password-encrypted backup. The synchronization command verifies the
deployment first and requires both history scans to complete. SDK provider
loading now succeeds through the runtime's proxy-aware transport. The live UTXO
scan completed. TXID history downloads now work, but full scan validation awaits
separate RPC approval from automatic review. POI requests are approved, and their
transport is fixed; synchronization has not passed.

This is a cryptographic development test, not a settled payment. Synchronization,
test-token funding and merchant receipts remain unfinished. The buyer approval checks are not yet
an independently enforced onchain firewall.

See [Segment 1J](privacy/SEGMENT-1J.md) for POI transport and the current validation blocker,
[Segment 1I](privacy/SEGMENT-1I.md) for TXID history retrieval,
[Segment 1H](privacy/SEGMENT-1H.md) for the RPC connection fix,
[Segment 1G](privacy/SEGMENT-1G.md) for workspace and synchronization commands,
[Segment 1F](privacy/SEGMENT-1F.md) for storage and deployment checks,
[Segment 1E](privacy/SEGMENT-1E.md) for the local proof, and
[the build log](docs%20/%20BUILD_LOG.md) for the implementation history.
