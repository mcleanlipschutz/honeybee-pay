# Receipts before and after ZK

## Available now

The Receipts tab reads confirmed public Sepolia USDC transfers for the signed-in
wallet. Buyers see Sent and merchants see Received for the same transaction/log
reference. Both can reopen the record or download a text copy. Faucet funding and
transfers outside Honeybee are included and labeled as token transfers, not
invoices. The public chain preserves these records across devices and sessions.

This does not provide a private payment receipt, encrypted receipt database,
merchant invoice, delivery confirmation, legal identity verification or email
notification. The public adapter is isolated in checkout/src/receipts.mjs.

## Proposed private receipt flow — not implemented

1. The merchant creates an invoice with a random unique ID, private recipient,
   token, amount, expiry and order reference. Buyer approval binds the invoice's
   exact payment terms. Item descriptions and customer identities stay offchain.
2. The buyer submits the approved private payment. A generated proof or a
   broadcast transaction alone does not mark the invoice paid. Track pending,
   confirmed, failed and reconciliation states separately.
3. Each wallet synchronizes and decrypts its own transaction data. The buyer's
   outgoing record and the merchant's incoming record are checked against the
   approved invoice, amount, token, recipient and finalized transaction state.
   Match each invoice/payment once; retries must not create duplicate receipts.
4. Bind the private payment to the random invoice reference through an encrypted
   memo or another authenticated private message, after verifying the installed
   SDK's memo semantics. RAILGUN exposes memoText and a separate
   showSenderAddressToRecipient option. Do not put invoice/customer details in
   public calldata or assume the merchant can see the buyer's private address.
5. Produce per-party receipt views with amount, token, date, invoice reference,
   status and the details each party is entitled to see. A merchant-authenticated
   acknowledgement can be added for proof that this merchant accepted this
   invoice; a blockchain proof alone does not certify a business identity or
   delivery of goods.
6. Keep invoice metadata and receipts encrypted with keys controlled by the
   appropriate user; hosted storage should hold ciphertext. Signing in identifies
   the account but is not itself a decryption key. Test key recovery, authentication,
   device changes and tenant isolation before relying on cross-device storage.
   The current trusted local runtime sees decrypted keys; operator-blind hosting
   requires a further key-management design and must not be claimed today.
7. Replace the public receipt reader with the private wallet/encrypted-store
   reader and adapt the view to omit unavailable or private-only address fields.
   Keep separate public and private receipt types; never reconstruct private
   payment details from public ERC-20 Transfer logs or label shielding as a
   completed private merchant payment.

## Email option

The default proposed notification is a generic message such as “Your receipt is
ready,” linking to the signed-in receipt view. Access must still require account
authorization and the necessary decryption material; a receipt link alone must
not grant access. Do not send seeds, passwords, viewing keys or reusable bearer
tokens in email.

Amounts, merchant names and item details in ordinary email are visible to the
email provider and anyone with mailbox access. Sending those details should be a
separate explicit user choice. An email service, verified sender domain,
recipient mapping, opt-in preferences, idempotent delivery and failure/retry
handling are still required. No notification service is configured or invoked.

## Gates for private receipts

- Verify the installed SDK's encrypted memo and sender-visibility behavior.
- Restore each wallet and recover its own receipt history after a restart.
- Reconcile a real private merchant payment once, including interrupted sessions.
- Reject wrong amounts, wrong invoice references and duplicate acknowledgements.
- Test wrong-account access and selective receipt export without wallet-wide keys.
- Confirm logs, email and analytics contain no decrypted private receipt payloads.

Source: [RAILGUN private ERC-20 transfer API](https://docs.railgun.org/developer-guide/wallet/transactions/private-transfers/private-erc-20-transfers.md).
The invoice, encrypted-storage and email flow above is a proposed Honeybee design,
not an assertion that the SDK supplies a complete merchant receipt system.
