# Honeybee Pay
Honeybee Pay is an ETHGlobal hackathon project that aims to simplify crypto payments with AI, protect transaction details using zero-knowledge proofs, and block payments that don’t match the user’s approved rules.

The [product direction](PRODUCT_DIRECTION.md) is an app or website where users
create their profile and wallet and pay merchants from a shielded balance. KYC
is deferred until after testing and a review of the time before submission; it
may wait until after the contest. See the [first-test checklist](TEST_CHECKLIST.md).
The current checkout still uses public test transfers.

## The problem

Crypto is often treated as a trading asset, while everyday payments remain a limited use case in the United States. Paying with crypto can be confusing for ordinary users, and transactions on public blockchains can expose payment amounts and wallet activity. Scams and unauthorized transactions create additional risks, including when AI tools are used to deceive users or manipulate payment instructions. Honeybee Pay aims to address these barriers by making payments easier, protecting transaction privacy, and enforcing the user’s approved payment terms.

## First demo

- The buyer approves 3 seperate transactions of 1 test USDC to send to the merchant wallet. 

- Transaction 1 is successful without issue. transaction 2 is attacked and redirected to the attacker's wallet in an intentionally unprotected demo. transaction 3 is also attacked with the same redirection but is rejected because the recipient differs from the buyer's approval.

- The buyer receives an AI generated message informing them of the detected change of recipient details and that the transaction was blocked.
 
- This first demo will test payment authorization and firewall enforcement; ZK privacy will be developed and tested separately.

## Current status

[Segment 1P](privacy/SEGMENT-1P.md) adds account-scoped private history scanning
and spendable-balance snapshots to the protected local wallet flow. Focused
authentication, recovery and synchronization checks pass. Live account sync,
shielding and settled private payments remain the next gates. The hosted demo
currently provides public test checkout, receipts and a test-payment counter.

The local [account-wallet service](privacy/SEGMENT-1K.md) now binds private
wallets to verified login tokens, creates separate buyer/merchant roots, and
supports encrypted recovery under the same account. [Segment 1L](privacy/SEGMENT-1L.md)
connects browser setup and recovery to a protected local API. Automated client/API
checks use real SDK wallets and local token fixtures. Live Privy and browser
validation remain outstanding; KYC is deferred and private checkout is unbuilt.

A customer-facing [Privy checkout](checkout/README.md) is now implemented with
email login, an embedded buyer wallet, reviewed Sepolia USDC transfers and
receipt verification. Its build and payment tests pass. A Privy App ID, browser
verification and a funded test transaction are still needed for live validation.
This checkout uses public transfers; its RAILGUN private-payment connection is
not implemented yet.

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
loading now succeeds through the runtime's proxy-aware transport. The approved
live Sepolia run completed both UTXO and TXID history scans with deployment and
POI checks enabled. The disposable demo wallets synchronized successfully.

This is a cryptographic development test, not a settled payment. Test-token
funding, spendable-balance verification and merchant receipts remain unfinished. The buyer approval checks are not yet
an independently enforced onchain firewall.

See [Segment 1J](privacy/SEGMENT-1J.md) for POI transport and successful synchronization results,
[Segment 1I](privacy/SEGMENT-1I.md) for TXID history retrieval,
[Segment 1H](privacy/SEGMENT-1H.md) for the RPC connection fix,
[Segment 1G](privacy/SEGMENT-1G.md) for workspace and synchronization commands,
[Segment 1F](privacy/SEGMENT-1F.md) for storage and deployment checks,
[Segment 1E](privacy/SEGMENT-1E.md) for the local proof, and
[the build log](docs%20/%20BUILD_LOG.md) for the implementation history.
