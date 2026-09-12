import { decodeEventLog, decodeFunctionData, encodeEventTopics, encodeAbiParameters, getAddress, parseAbi } from 'viem';
import { shieldAbi, approvalAbi, shieldToken, shieldProxy } from './shield-review.mjs';
import { validateShieldAttempt } from './shield-attempts.mjs';

// Engine 9.6.0, dist/abi/V2.1/RailgunSmartWallet.json. A parity test uses that ABI.
export const shieldEventAbi = parseAbi([
  'event Shield(uint256 treeNumber,uint256 startPosition,(bytes32 npk,(uint8 tokenType,address tokenAddress,uint256 tokenSubID) token,uint120 value)[] commitments,(bytes32[3] encryptedBundle,bytes32 shieldKey)[] shieldCiphertext,uint256[] fees)',
]);
export const approvalEventAbi = parseAbi(['event Approval(address indexed owner,address indexed spender,uint256 value)']);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const equalAddress = (a, b) => getAddress(a.toLowerCase()) === getAddress(b.toLowerCase());
const equalHex = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const quantity = value => {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value) || BigInt(value) >= 2n ** 256n) throw new Error('Invalid transaction quantity');
  return BigInt(value);
};
const requireMatch = condition => { if (!condition) throw new Error('Transaction does not match the deposit record'); };

function verifyEvent(receipt, intent) {
  const approval = intent.stage === 'approval';
  const abi = approval ? approvalEventAbi : shieldEventAbi;
  const eventName = approval ? 'Approval' : 'Shield';
  const topic = encodeEventTopics({ abi, eventName })[0];
  const contract = approval ? shieldToken : shieldProxy;
  const logs = receipt.logs.filter(log => equalAddress(log.address, contract) && equalHex(log.topics[0], topic));
  requireMatch(logs.length === 1);
  const log = logs[0];
  requireMatch(log.removed === false && equalHex(log.transactionHash, receipt.transactionHash)
    && equalHex(log.blockHash, receipt.blockHash) && quantity(log.blockNumber) === quantity(receipt.blockNumber)
    && quantity(log.transactionIndex) === quantity(receipt.transactionIndex));
  quantity(log.logIndex);
  const { args } = decodeEventLog({ abi, eventName, data: log.data, topics: log.topics, strict: true });
  // Reject noncanonical event encodings and extra topics, not just decoded fields.
  const event = abi[0], nonIndexed = event.inputs.filter(input => !input.indexed);
  requireMatch(equalHex(log.data, encodeAbiParameters(nonIndexed, nonIndexed.map(input => args[input.name])))
    && JSON.stringify(log.topics.map(x => x.toLowerCase())) === JSON.stringify(encodeEventTopics({ abi, eventName, args }).map(x => x.toLowerCase())));
  if (approval) {
    const decoded = decodeFunctionData({ abi: approvalAbi, data: intent.transaction.data });
    requireMatch(decoded.functionName === 'approve' && equalAddress(decoded.args[0], shieldProxy)
      && decoded.args[1] === BigInt(intent.amountUnits)
      && equalAddress(args.owner, intent.transaction.from) && equalAddress(args.spender, shieldProxy)
      && args.value === BigInt(intent.amountUnits));
  } else {
    const decoded = decodeFunctionData({ abi: shieldAbi, data: intent.transaction.data });
    requireMatch(decoded.functionName === 'shield' && decoded.args[0].length === 1
      && args.commitments.length === 1 && args.shieldCiphertext.length === 1 && args.fees.length === 1);
    const original = decoded.args[0][0], commitment = args.commitments[0], ciphertext = args.shieldCiphertext[0];
    requireMatch(original.preimage.value === BigInt(intent.amountUnits)
      && equalHex(original.preimage.npk, commitment.npk)
      && original.preimage.token.tokenType === 0 && commitment.token.tokenType === 0
      && equalAddress(original.preimage.token.tokenAddress, shieldToken) && equalAddress(commitment.token.tokenAddress, shieldToken)
      && original.preimage.token.tokenSubID === 0n && commitment.token.tokenSubID === 0n
      && commitment.value === BigInt(intent.receivedUnits) && args.fees[0] === BigInt(intent.feeUnits)
      && commitment.value + args.fees[0] === BigInt(intent.amountUnits)
      && equalHex(ciphertext.shieldKey, original.ciphertext.shieldKey)
      && ciphertext.encryptedBundle.every((part, i) => equalHex(part, original.ciphertext.encryptedBundle[i])));
  }
  return log.logIndex;
}

// Read-only and independent of review/quote expiry: a late inclusion still needs
// reconciliation. Never infer failure from a missing hash/receipt or follow a
// replacement automatically. Block confirmation/finality data are RPC observations.
export async function checkShieldAttempt({ attempt, hash = attempt.hash, request }) {
  validateShieldAttempt(attempt);
  if (!HASH.test(hash)) throw new Error('A transaction hash is required to reconcile this attempt');
  if (attempt.hash && !equalHex(hash, attempt.hash)) throw new Error('Replacement transactions need separate review');
  const { intent } = attempt, expected = intent.transaction;
  requireMatch(expected.chainId === 11155111 && expected.type === 2 && quantity(expected.value) === 0n
    && equalAddress(expected.to, intent.stage === 'approval' ? shieldToken : shieldProxy)
    && BigInt(intent.amountUnits) > 0n && BigInt(intent.amountUnits) <= 10_000_000n);
  requireMatch(quantity(await request('eth_chainId', [])) === 11155111n);
  const tx = await request('eth_getTransactionByHash', [hash]);
  if (!tx) return { status: 'unknown', hash: attempt.hash, spendableBalanceVerified: false };
  requireMatch(equalHex(tx.hash, hash) && quantity(tx.chainId) === 11155111n && quantity(tx.type) === 2n
    && equalAddress(tx.from, expected.from) && equalAddress(tx.to, expected.to) && equalHex(tx.input, expected.data)
    && quantity(tx.value) === 0n && quantity(tx.nonce) === quantity(expected.nonce)
    && quantity(tx.gas) === quantity(expected.gasLimit)
    && quantity(tx.maxFeePerGas) === quantity(expected.maxFeePerGas)
    && quantity(tx.maxPriorityFeePerGas) === quantity(expected.maxPriorityFeePerGas)
    && (!tx.accessList || tx.accessList.length === 0));
  const receipt = await request('eth_getTransactionReceipt', [hash]);
  if (!receipt) return { status: 'pending', hash, spendableBalanceVerified: false };
  requireMatch(equalHex(receipt.transactionHash, hash) && HASH.test(receipt.blockHash)
    && equalHex(tx.blockHash, receipt.blockHash) && quantity(tx.blockNumber) === quantity(receipt.blockNumber)
    && quantity(tx.transactionIndex) === quantity(receipt.transactionIndex)
    && equalAddress(receipt.from, expected.from) && equalAddress(receipt.to, expected.to)
    && ['0x0', '0x1'].includes(receipt.status) && quantity(receipt.type) === 2n && Array.isArray(receipt.logs)
    && quantity(receipt.gasUsed) > 0n && quantity(receipt.gasUsed) <= quantity(expected.gasLimit)
    && quantity(receipt.effectiveGasPrice) <= quantity(expected.maxFeePerGas));
  const block = await request('eth_getBlockByNumber', [receipt.blockNumber, false]);
  requireMatch(equalHex(block?.hash, receipt.blockHash) && quantity(block.number) === quantity(receipt.blockNumber));
  // Approval needs two canonical confirmations plus a fresh allowance preflight.
  // Waiting for finalization here would outlast the original five-minute review.
  const headTag = intent.stage === 'approval' ? 'latest' : 'finalized';
  const head = await request('eth_getBlockByNumber', [headTag, false]);
  if (!head || !HASH.test(head.hash)) throw new Error('Confirmation block is unavailable');
  const minimum = quantity(receipt.blockNumber) + (intent.stage === 'approval' ? 1n : 0n);
  if (quantity(head.number) < minimum) return { status: 'pending', hash, spendableBalanceVerified: false };
  const logIndex = receipt.status === '0x1' ? verifyEvent(receipt, intent) : null;
  const canonical = await request('eth_getBlockByNumber', [receipt.blockNumber, false]);
  requireMatch(equalHex(canonical?.hash, receipt.blockHash) && quantity(canonical.number) === quantity(receipt.blockNumber));
  return { status: receipt.status === '0x0' ? 'reverted' : intent.stage === 'approval' ? 'approval-confirmed' : 'deposit-confirmed',
    hash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber, logIndex,
    confirmationPolicy: intent.stage === 'approval' ? 'two-canonical-confirmations' : 'finalized',
    networkFeeWei: (quantity(receipt.gasUsed) * quantity(receipt.effectiveGasPrice)).toString(),
    spendableBalanceVerified: false, merchantPayment: false };
}
