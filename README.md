# honeybee-pay
Honeybee Pay is an ETHGlobal hackathon project that aims to simplify crypto payments with AI, protect transaction details using zero-knowledge proofs, and block payments that don’t match the user’s approved rules.

## The problem

Crypto is often treated as a trading asset, while everyday payments remain a limited use case in the United States. Paying with crypto can be confusing for ordinary users, and transactions on public blockchains can expose payment amounts and wallet activity. Scams and unauthorized transactions create additional risks, including when AI tools are used to deceive users or manipulate payment instructions. Honeybee Pay aims to address these barriers by making payments easier, protecting transaction privacy, and enforcing the user’s approved payment terms.

## First demo

- the buyer approves 3 seperste transactions of 1 test usdc to send to the merchant wallet. 

- transaction 1 is successful without issue. transaction 2 is attacked and redirected to the attacker's wallet in an intentionally unprotected demo. transaction 3 is also attacked with the same redirection but is rejected because the recipient differs from the buyer's approval.

- the buyer receives an AI generated message informing them of the detected change of recipient details and that the transaction was blocked.
 
