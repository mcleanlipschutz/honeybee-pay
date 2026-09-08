import { createPrivateTransferAdapter } from './private-transfer.mjs';

// Integration entry point only. Dependencies and engine setup are NOT installed
// by the unit-test package. See REVIEW.md for the outstanding integration gate.
export async function loadRailgunAdapter() {
  const sdk = await import('@railgun-community/wallet');
  const { TXIDVersion } = await import('@railgun-community/shared-models');
  return createPrivateTransferAdapter({ sdk, txidVersion: TXIDVersion.V2_PoseidonMerkle });
}
