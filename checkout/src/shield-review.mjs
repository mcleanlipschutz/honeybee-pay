import { decodeFunctionData, encodeFunctionData, getAddress, keccak256, parseAbi, parseUnits, stringToHex } from 'viem';

export const shieldToken = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
export const shieldProxy = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea';
export const shieldAbi = parseAbi([
  'function shield(((bytes32 npk,(uint8 tokenType,address tokenAddress,uint256 tokenSubID) token,uint120 value) preimage,(bytes32[3] encryptedBundle,bytes32 shieldKey) ciphertext)[] _shieldRequests) payable',
]);
export const approvalAbi = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);
export function shieldAmountUnits(amount) {
  const invalid = () => new Error('Enter more than zero and no more than 10 test USDC, using up to six decimal places.');
  if (typeof amount !== 'string' || amount.length > 16 || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(amount)) throw invalid();
  const value = parseUnits(amount, 6);
  if (value <= 0n || value > 10_000_000n) throw invalid();
  return value;
}
const units = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new Error('Invalid units');
  const number = BigInt(value);
  if (number >= 2n ** 256n) throw new Error('Invalid units');
  return number;
};
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// The digest detects a changed review; it is NOT a server signature, proof of
// private ownership, current allowance, or authorization to sign a transaction.
export function validateShieldReview(value, { amount, publicAddress, walletId, privateAddress }, now = Date.now()) {
  const review = structuredClone(value);
  const { reviewId, ...body } = review;
  if (keccak256(stringToHex(JSON.stringify(body))) !== reviewId) throw new Error('Review changed');
  const amountUnits = units(review.amountUnits), fee = units(review.feeUnits), received = units(review.receivedUnits);
  const feeBps = units(review.feeBps), allowance = units(review.allowanceUnits);
  if (review.version !== 1 || review.status !== 'prepared-not-submitted' || review.submissionEnabled !== false
      || review.network !== 'Ethereum_Sepolia' || review.chainId !== 11155111 || review.token !== shieldToken
      || review.walletId !== walletId || review.privateAddress !== privateAddress
      || typeof privateAddress !== 'string' || !privateAddress.startsWith('0zk')
      || getAddress(review.publicAddress) !== getAddress(publicAddress)
      || amountUnits !== shieldAmountUnits(amount)
      || received <= 0n || received + fee !== amountUnits || feeBps >= 10000n
      || fee !== amountUnits * feeBps / 10000n || units(review.publicBalanceUnits) < amountUnits
      || review.approvalRequired !== (allowance < amountUnits) || review.gasEstimate !== null
      || !Number.isSafeInteger(review.createdAt) || review.createdAt <= 0 || review.createdAt > now + 5000
      || !Number.isSafeInteger(review.expiresAt) || review.expiresAt <= now || review.expiresAt <= review.createdAt
      || review.expiresAt > review.createdAt + 300000
      || !/^0x[0-9a-fA-F]+$/.test(review.blockNumber) || !/^0x[0-9a-fA-F]{64}$/.test(review.blockHash)) throw new Error('Invalid deposit review');
  const transaction = (tx, to, abi) => {
    if (!tx || Object.keys(tx).sort().join(',') !== 'chainId,data,from,to,value'
        || tx.chainId !== 11155111 || getAddress(tx.from) !== getAddress(publicAddress)
        || getAddress(tx.to) !== getAddress(to) || tx.value !== '0x0') throw new Error('Transaction changed');
    const decoded = decodeFunctionData({ abi, data: tx.data });
    if (encodeFunctionData({ abi, ...decoded }) !== tx.data) throw new Error('Noncanonical transaction');
    return decoded;
  };
  const { functionName, args } = transaction(review.transaction, shieldProxy, shieldAbi);
  if (functionName !== 'shield' || args[0].length !== 1) throw new Error('Unexpected shield requests');
  const { preimage } = args[0][0];
  if (preimage.token.tokenType !== 0 || getAddress(preimage.token.tokenAddress) !== shieldToken
      || preimage.token.tokenSubID !== 0n || preimage.value !== amountUnits) throw new Error('Deposit terms changed');
  if (review.approvalRequired) {
    const approval = transaction(review.approval, shieldToken, approvalAbi);
    if (approval.functionName !== 'approve' || getAddress(approval.args[0]) !== shieldProxy
        || approval.args[1] !== amountUnits) throw new Error('Approval terms changed');
  } else if (review.approval !== null) throw new Error('Unexpected approval');
  return freeze(review);
}
