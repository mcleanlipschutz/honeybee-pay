/**
 * Honeybee Pay — review-only RAILGUN transfer adapter.
 * This module generates/populates a transfer; it NEVER broadcasts it.
 * Checks here protect this application path, not against a compromised signer.
 */
export function parseUSDC(text) {
  if (typeof text !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(text)) {
    throw new Error('Enter a decimal amount with at most six decimal places');
  }
  const [whole, fraction = ''] = text.split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (units <= 0n || units > (1n << 64n) - 1n) throw new Error('Amount out of range');
  return units;
}

export function snapshotInvoice(invoice) {
  const { id, network, recipient, token, amountUnits, expiresAt } = invoice;
  for (const value of [id, network, recipient]) {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Missing invoice field');
  }
  // Only a superficial format check: the SDK must validate the private address.
  if (!recipient.startsWith('0zk')) throw new Error('A private RAILGUN recipient is required');
  if (typeof token !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(token) || /^0x0{40}$/.test(token)) {
    throw new Error('Invalid token address');
  }
  if (typeof amountUnits !== 'bigint' || amountUnits <= 0n || amountUnits > (1n << 64n) - 1n) {
    throw new Error('Amount out of range');
  }
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error('Invalid expiry');
  return Object.freeze({ id, network, recipient, token: token.toLowerCase(), amountUnits, expiresAt });
}

function matchInvoice(approved, proposed, now) {
  for (const key of Object.keys(approved)) {
    if (approved[key] !== proposed[key]) throw new Error(`Payment changed: ${key}`);
  }
  if (now >= approved.expiresAt) throw new Error('Invoice expired');
}

export function createPrivateTransferAdapter({ sdk, txidVersion, now = () => Math.floor(Date.now() / 1000) }) {
  // One instance per engine/session. Do not run a competing proof flow outside it.
  let busy = false;
  return async function prepare({ approvedInvoice, proposedInvoice, walletID, encryptionKey,
    overallBatchMinGasPrice, transactionGasDetails, broadcasterFee }) {
    if (busy) throw new Error('A proof is already in progress');
    const approved = snapshotInvoice(approvedInvoice);
    const proposed = snapshotInvoice(proposedInvoice);
    matchInvoice(approved, proposed, now());
    if (!walletID || !encryptionKey) throw new Error('A loaded private wallet is required');
    if (typeof overallBatchMinGasPrice !== 'bigint' || overallBatchMinGasPrice < 0n) {
      throw new Error('Invalid gas price');
    }
    if (!transactionGasDetails || !broadcasterFee) throw new Error('Broadcaster quote required');
    // Quote must come from a trusted integration, with user-reviewed fees.
    const gas = structuredClone(transactionGasDetails);
    const fee = structuredClone(broadcasterFee);
    const recipients = [{ tokenAddress: approved.token, amount: approved.amountUnits,
      recipientAddress: approved.recipient }];
    busy = true;
    try {
      // false: do not reveal the sender's private address to the recipient.
      // false: use a broadcaster, not the buyer's public wallet to submit.
      await sdk.generateTransferProof(txidVersion, approved.network, walletID, encryptionKey,
        false, undefined, structuredClone(recipients), [], structuredClone(fee), false,
        overallBatchMinGasPrice, () => {});
      matchInvoice(approved, proposed, now());
      const populated = await sdk.populateProvedTransfer(txidVersion, approved.network, walletID,
        false, undefined, structuredClone(recipients), [], structuredClone(fee), false,
        overallBatchMinGasPrice, gas);
      matchInvoice(approved, proposed, now());
      return { status: 'prepared-not-paid', invoiceID: approved.id, populated };
    } finally {
      busy = false;
    }
  };
}
