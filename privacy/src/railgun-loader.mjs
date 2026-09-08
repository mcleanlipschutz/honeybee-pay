import { createPrivateTransferAdapter } from './private-transfer.mjs';

// Real SDK entry point. Dependencies are pinned; engine/prover setup is still
// outstanding. See SEGMENT-1B-REVIEW.md before integration.
export async function loadRailgunAdapter() {
  const sdk = await import('@railgun-community/wallet');
  const { TXIDVersion } = await import('@railgun-community/shared-models');
  const prepare = createPrivateTransferAdapter({ sdk, txidVersion: TXIDVersion.V2_PoseidonMerkle });
  return async request => {
    for (const invoice of [request.approvedInvoice, request.proposedInvoice]) {
      sdk.assertValidRailgunAddress(invoice?.recipient);
    }
    return prepare(request);
  };
}
