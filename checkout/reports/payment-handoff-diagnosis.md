# Mobile payment handoff — September 14, 2026

## Observed status

The owner added the deployed HTTPS origin to Privy's allowed origins. Their phone screenshot then showed successful sign-in and a balance of 17 test USDC. That confirms the earlier HB-A03 sign-in obstruction was resolved for this phone/session.

The next screenshot shows an unresolved 1 USDC payment. The live tracking database contains its pending intent and no transaction or candidate hash; the worker recorded a successful intent-creation request. This is evidence that authenticated preparation reached the server. It does **not** prove a transaction was broadcast, rejected, or mined. The earlier historical completed payment is a separate transaction and cannot resolve this attempt.

The old client did not retain its wallet exception, so the exact original failure cannot be reconstructed from these records. Independent live-chain reads from this execution environment did not complete. No payment was signed, resent, cleared, or marked successful during this investigation.

## Changes and evidence

- Explicitly configure Privy's supported and default Sepolia chain with its documented RPC override. Previously its recognized-chain normalization selected Privy's RPC while Honeybee's balance, review and recovery used PublicNode. Both now use the same explicit endpoint.
- Normalize the reviewed gas limit to `gasLimit`, the public wallet SDK request field, and preserve both fee caps, calldata, chain, asset, value and hexadecimal nonce. The installed SDK runtime also accepts `gas`; the previous spelling alone is **not** established as the cause of this incident.
- Distinguish a successful status query with no matching confirmation from an unavailable status query. Neither can declare success, delete the journal, or initiate another send.
- Keep the existing unknown-payment lock and exact canonical receipt/nonce checks. Deploying this change does not itself resolve or resubmit the pending payment.

The installed Privy chain-normalization helper and transaction converter are exercised directly in tests. The JSX send-handler test checks a single explicit send, nonce zero, gas-limit/fee preservation, duplicate-click prevention, and both status-query outcomes. Full checkout suite: 70 passing tests. Production build passed. These checks do not substitute for a confirmed transaction from the owner's phone.

Reference: [Privy's documented EVM RPC override](https://docs.privy.io/basics/react/advanced/configuring-evm-networks); pinned `@privy-io/react-auth` 3.42.0 and `@privy-io/chains` 0.6.0 implementation and declarations.

## Remaining owner checks

- [x] Add the deployed origin and sign in on the phone.
- [ ] Reload the same browser tab after this update and check the existing payment's status. Preserve browser data and do not create a replacement payment on another device.
- [ ] If still unresolved, share the updated status screen; if Activity or the recipient shows a transaction reference, use that exact reference for receipt verification.

## CROPS delta

The accepted public-testnet architecture remains unchanged: Privy controls availability of hosted authentication/signing, PublicNode supplies chain observations and submission, the frontend host controls delivered code, and the USDC issuer has external token authority. One explicit RPC removes an unintended second network path but concentrates availability in that provider. Public transfers, wallet addresses, amounts and timing remain visible; no ZK privacy is claimed for this build. Source and configuration are inspectable under the existing MIT license, while hosted vendor services are not reproduced by the source. No additional signer, allowance, delegated spending authority, key export, or automatic resubmission is introduced. Vendor-independent recovery and a production security review remain outstanding.
