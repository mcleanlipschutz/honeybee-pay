import { getAddress, isAddress, parseUnits, encodeFunctionData, erc20Abi, decodeEventLog } from 'viem';
export const CHAIN_ID = 11155111;
// Circle's published Ethereum Sepolia USDC address (checked 2026-09-10).
export const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
export function approvePayment({ recipient, amount, sender }, now = Date.now()) {
  if (![recipient, sender].every(a => isAddress(a, { strict: true })) || /^0x0{40}$/i.test(recipient)) throw new Error('Enter a valid Ethereum merchant address.');
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount)) throw new Error('Use a plain amount with up to six decimal places.');
  const units = parseUnits(amount, 6);
  if (units <= 0n || units > 10_000_000n) throw new Error('This test checkout accepts more than 0 and at most 10 USDC.');
  if (recipient.toLowerCase() === sender.toLowerCase()) throw new Error('Buyer and merchant must be different wallets.');
  return Object.freeze({ recipient: getAddress(recipient), sender: getAddress(sender), amountUnits: units.toString(),
    chainId: CHAIN_ID, token: USDC, expiresAt: now + 300_000 });
}
export function buildTransfer(approved, proposal, sender, now = Date.now()) {
  if (!approved || now >= approved.expiresAt) throw new Error('Approval expired. Review the payment again.');
  for (const key of ['recipient', 'sender', 'amountUnits', 'chainId', 'token', 'expiresAt']) {
    if (approved[key] !== proposal[key]) throw new Error('Payment blocked: approved details changed.');
  }
  if (approved.chainId !== CHAIN_ID || approved.token !== USDC || approved.sender.toLowerCase() !== sender.toLowerCase()) throw new Error('Wallet or network changed. Review again.');
  return Object.freeze({ chainId: CHAIN_ID, to: USDC, value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [approved.recipient, BigInt(approved.amountUnits)] }) });
}
export function verifyReceipt(receipt, approved) {
  if (receipt.status !== 'success') throw new Error('The transaction reverted. No payment receipt issued.');
  const matches = receipt.logs.filter(log => {
    if (log.address.toLowerCase() !== USDC.toLowerCase()) return false;
    try {
      const { eventName, args } = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      return eventName === 'Transfer' && args.from.toLowerCase() === approved.sender.toLowerCase()
        && args.to.toLowerCase() === approved.recipient.toLowerCase() && args.value === BigInt(approved.amountUnits);
    } catch { return false; }
  });
  if (matches.length !== 1) throw new Error('Receipt did not match the approved USDC transfer.');
  return { transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(),
    recipient: approved.recipient, amountUnits: approved.amountUnits, chainId: CHAIN_ID, privacy: 'public' };
}
