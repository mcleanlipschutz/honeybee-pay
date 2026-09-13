import { getAddress, AbiCoder, keccak256 } from 'ethers';
import { walletInterface, relayInterface } from './deployment-check.mjs';
import { testNetwork } from './network-preflight.mjs';

export const paymentProxy = testNetwork('Ethereum_Sepolia').proxyContract;
export const paymentRelay = testNetwork('Ethereum_Sepolia').relayAdaptContract;
export const bindingHash = (txs, action) => keccak256(AbiCoder.defaultAbiCoder().encode(
  ['bytes32[][]', 'uint256', 'tuple(bytes31 random,bool requireSuccess,uint256 minGasLimit,tuple(address to,bytes data,uint256 value)[] calls)'],
  [txs.map(tx => tx.nullifiers), txs.length, action]));
const zeroAddress = '0x0000000000000000000000000000000000000000';
const zeroWord = '0x' + '00'.repeat(32);
const word = value => typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);
export const paymentHash = value => {
  if (typeof value !== 'string' || !/^(?:0x)?[a-fA-F0-9]{64}$/.test(value)) throw new Error('Invalid private transaction hash');
  return (value.startsWith('0x') ? value : '0x' + value).toLowerCase();
};

export function decodePrivatePaymentBatch(transaction, expectedNullifiers, minGas) {
  if (!transaction || ![getAddress(paymentProxy), getAddress(paymentRelay)].includes(getAddress(transaction.to))
      || BigInt(transaction.value || 0) !== 0n || typeof transaction.data !== 'string'
      || transaction.data.length > 131072) throw new Error('Unexpected private transaction');
  const relayed = getAddress(transaction.to) === getAddress(paymentRelay);
  const abi = relayed ? relayInterface : walletInterface, method = relayed ? 'relay' : 'transact';
  const decoded = abi.decodeFunctionData(method, transaction.data);
  if (abi.encodeFunctionData(method, decoded).toLowerCase() !== transaction.data.toLowerCase()
      || decoded[0].length !== (relayed ? 2 : 1)) throw new Error('Unexpected private proof batch');
  const transactions = decoded[0];
  const action = relayed ? decoded[1] : null;
  if (relayed && (!action.requireSuccess || action.minGasLimit !== 0n || action.calls.length !== 0)) throw new Error('Unexpected private relay actions');
  const adaptParams = relayed ? bindingHash(transactions, action) : zeroWord;
  for (const tx of transactions) {
    const b = tx.boundParams;
    if (tx.nullifiers.length !== 1 || ![2, 3].includes(tx.commitments.length)
        || b.commitmentCiphertext.length !== tx.commitments.length || b.unshield !== 0n
        || b.chainID !== 11155111n || getAddress(b.adaptContract) !== getAddress(relayed ? paymentRelay : zeroAddress) || b.adaptParams !== adaptParams
        || b.minGasPrice !== BigInt(minGas) || tx.unshieldPreimage.value !== 0n
        || !word(tx.merkleRoot) || tx.proof.a.x === 0n || tx.proof.a.y === 0n
        || tx.proof.c.x === 0n || tx.proof.c.y === 0n) throw new Error('Unreviewed private transfer shape');
    if (transactions.length === 2 && tx.commitments.length !== 2) throw new Error('Separate fee payments require two 01x02 proofs');
  }
  const nullifiers = transactions.flatMap(tx => tx.nullifiers.map(paymentHash));
  if (new Set(nullifiers).size !== nullifiers.length || JSON.stringify(nullifiers) !== JSON.stringify(expectedNullifiers.map(paymentHash))) {
    throw new Error('Private transaction nullifiers changed');
  }
  return transactions;
}

export function decodePrivatePayment(transaction, expectedNullifiers, minGas) {
  const transactions = decodePrivatePaymentBatch(transaction, expectedNullifiers, minGas);
  if (transactions.length !== 1) throw new Error('Only one reviewed private transfer is supported');
  return transactions[0];
}

// No balance overrides and no dummy-sender verification shortcut. This checks
// the actual populated Groth16 proof using the reviewed deployed verifier.
export async function verifyPreparedPayment({ transaction, nullifiers, minGas, rpc, deployment, checkSession }) {
  const transactions = decodePrivatePaymentBatch(transaction, nullifiers, minGas);
  const block = deployment.blockNumber;
  const call = async (name, args) => {
    checkSession();
    const value = await rpc('eth_call', [{ to: paymentProxy,
      from: '0x0000000000000000000000000000000000000001',
      data: walletInterface.encodeFunctionData(name, args) }, block]);
    checkSession(); return walletInterface.decodeFunctionResult(name, value)[0];
  };
  for (const tx of transactions) {
    if (!await call('verify', [tx]) || !await call('rootHistory', [tx.boundParams.treeNumber, tx.merkleRoot])) {
      throw new Error('Private proof or Merkle root was not accepted');
    }
    for (const nullifier of tx.nullifiers) {
      if (await call('nullifiers', [tx.boundParams.treeNumber, nullifier])) throw new Error('Private note was already spent');
    }
  }
  const end = await rpc('eth_getBlockByNumber', [block, false]);
  if (end?.hash !== deployment.blockHash) throw new Error('Verification block changed');
  checkSession(); return { verified: true, outputs: transactions[0].commitments.length };
}

export async function verifyPrivatePaymentReceipt({ record, hash, rpc, checkSession }) {
  const original = record.populated;
  const expected = decodePrivatePaymentBatch(original.transaction, original.nullifiers, record.quote.minGasPriceWei);
  hash = paymentHash(hash);
  // A broadcaster ACK is untrusted. Fee replacements can have another hash
  // while preserving the exact approved proof/calldata. Bind to that immutable
  // payload and its nullifiers, not an unverified acknowledgement hash.
  checkSession();
  if (BigInt(await rpc('eth_chainId', [])) !== 11155111n) throw new Error('Wrong receipt network');
  const tx = await rpc('eth_getTransactionByHash', [hash]);
  const receipt = await rpc('eth_getTransactionReceipt', [hash]);
  checkSession();
  if (!tx) return { status: 'unknown', hash: record.hash || null };
  if (paymentHash(tx.hash) !== hash || getAddress(tx.to) !== getAddress(original.transaction.to)
      || tx.input?.toLowerCase() !== original.transaction.data.toLowerCase()
      || BigInt(tx.value) !== 0n || (tx.chainId && BigInt(tx.chainId) !== 11155111n)) throw new Error('Transaction does not match the approved private payment');
  if (!receipt?.blockNumber) return { status: 'pending', hash };
  if (paymentHash(receipt.transactionHash) !== hash || !word(receipt.blockHash)
      || tx.blockHash !== receipt.blockHash || tx.blockNumber !== receipt.blockNumber
      || getAddress(receipt.to) !== getAddress(original.transaction.to)
      || getAddress(receipt.from) !== getAddress(tx.from)
      || !['0x0', '0x1'].includes(receipt.status)) throw new Error('Invalid private payment receipt');
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  const head = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (block?.hash !== receipt.blockHash || block.number !== receipt.blockNumber || !word(head?.hash)) throw new Error('Receipt block is not canonical');
  if (BigInt(head.number) < BigInt(block.number) + 1n) return { status: 'pending', hash };
  if (receipt.status === '0x1') {
    const events = receipt.logs.filter(log => log.address?.toLowerCase() === paymentProxy.toLowerCase()).map(log => {
      if (log.removed || log.blockHash !== block.hash || log.blockNumber !== block.number || paymentHash(log.transactionHash) !== hash) throw new Error('Invalid payment event');
      let parsed; try { parsed = walletInterface.parseLog(log); } catch { return null; }
      if (!parsed) return null;
      const encoded = walletInterface.encodeEventLog(parsed.fragment, parsed.args);
      if (encoded.data.toLowerCase() !== log.data.toLowerCase()
          || JSON.stringify(encoded.topics.map(x => x.toLowerCase())) !== JSON.stringify(log.topics.map(x => x.toLowerCase()))) throw new Error('Noncanonical payment event');
      return parsed;
    }).filter(Boolean);
    const nullified = events.filter(e => e.name === 'Nullified'), transacted = events.filter(e => e.name === 'Transact');
    if (nullified.length !== expected.length || transacted.length !== 1) throw new Error('Private payment event count changed');
    // Deployed RailgunSmartWallet emits one Nullified per proof, followed by one
    // Transact containing the ordered commitments/ciphertexts of the whole batch.
    for (let i = 0; i < expected.length; i++) {
      if (nullified[i].args.treeNumber !== expected[i].boundParams.treeNumber
          || JSON.stringify(nullified[i].args.nullifier.map(paymentHash)) !== JSON.stringify(expected[i].nullifiers.map(paymentHash))) throw new Error('Private payment nullifiers do not match');
    }
    if (JSON.stringify(transacted[0].args.hash.map(paymentHash)) !== JSON.stringify(expected.flatMap(tx => tx.commitments.map(paymentHash)))
        || JSON.stringify(transacted[0].args.ciphertext.toArray(true)) !== JSON.stringify(expected.flatMap(tx => tx.boundParams.commitmentCiphertext.toArray(true)))) throw new Error('Private payment events do not match the proof');
  }
  const finalBlock = await rpc('eth_getBlockByNumber', [block.number, false]);
  if (finalBlock?.hash !== block.hash) throw new Error('Payment block changed during verification');
  checkSession();
  return { status: receipt.status === '0x1' ? 'confirmed' : 'reverted', hash, chainId: 11155111,
    blockNumber: block.number, blockHash: block.hash, timestamp: Number(BigInt(block.timestamp)),
    requestExpiredAtSettlement: BigInt(block.timestamp) >= BigInt(record.quote.request.expiresAt),
    confirmations: (BigInt(head.number) - BigInt(block.number) + 1n).toString() };
}
