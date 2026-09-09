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

This is a cryptographic development test, not a settled payment. Test-network
contract identity, persistent wallet storage, synchronization, test-token funding
and merchant receipts remain unfinished. The buyer approval checks are not yet
an independently enforced onchain firewall.

See [Segment 1E](privacy/SEGMENT-1E.md) for setup, results and limitations, and
[the build log](docs%20/%20BUILD_LOG.md) for the implementation history.
