import { Interface, getAddress, keccak256, toUtf8Bytes } from 'ethers';
import { walletInterface } from './deployment-check.mjs';
import { tokenInterface, shieldTestLimit } from './account-shield.mjs';
import { accountSyncToken, accountSyncNetwork } from './account-sync.mjs';
import { makeReadOnlyRpc, testNetwork } from './network-preflight.mjs';

const tokenState = new Interface(['function paused() view returns (bool)', 'function isBlacklisted(address) view returns (bool)']);
const quantity = value => {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) throw new Error('RPC quantity unavailable');
  const result = BigInt(value);
  if (result >= 2n ** 256n) throw new Error('RPC quantity out of range');
  return result;
};
export const gasQuoteLifetime = 60000;

// Trusted cache input only. The HTTP request contains a review ID, not calldata.
export async function preflightShield({ review, prepared, checkSession, expiresAt,
  rpc = makeReadOnlyRpc(prepared.rpcURL), now = Date.now }) {
  const check = () => {
    checkSession();
    if (now() >= review.expiresAt || now() >= expiresAt) throw new Error('Review or session expired');
  };
  check();
  const { reviewId, ...body } = review;
  const { proxyContract, chain } = testNetwork(accountSyncNetwork);
  const amount = BigInt(review.amountUnits);
  const { deployment } = prepared;
  if (reviewId !== keccak256(toUtf8Bytes(JSON.stringify(body))) || review.chainId !== chain.id
      || review.token !== accountSyncToken || review.submissionEnabled !== false
      || amount <= 0n || amount > shieldTestLimit
      || deployment.head !== 'latest' || deployment.chainID !== chain.id
      || deployment.status !== 'reviewed-deployment-and-circuit-matched'
      || deployment.proxyPaused !== false || deployment.verificationKeyMatches !== true
      || getAddress(deployment.proxy) !== getAddress(proxyContract)) throw new Error('Fresh reviewed deployment required');
  const { transaction: shield } = review;
  if (shield.chainId !== chain.id || getAddress(shield.from) !== getAddress(review.publicAddress)
      || getAddress(shield.to) !== getAddress(proxyContract) || shield.value !== '0x0'
      || Object.keys(shield).sort().join(',') !== 'chainId,data,from,to,value') throw new Error('Shield transaction changed');
  const [notes] = walletInterface.decodeFunctionData('shield', shield.data);
  if (notes.length !== 1 || walletInterface.encodeFunctionData('shield', [notes]) !== shield.data
      || notes[0].preimage.value !== amount || notes[0].preimage.token.tokenType !== 0n
      || notes[0].preimage.token.tokenSubID !== 0n
      || getAddress(notes[0].preimage.token.tokenAddress) !== accountSyncToken) throw new Error('Shield terms changed');
  const blockTag = deployment.blockNumber;
  const request = async (method, params) => { check(); const value = await rpc(method, params); check(); return value; };
  const block = await request('eth_getBlockByNumber', [blockTag, false]);
  const freshBlock = () => {
    if (block?.hash !== deployment.blockHash || block?.number !== blockTag
        || quantity(block.timestamp) * 1000n < BigInt(now() - 60000)
        || quantity(block.timestamp) * 1000n > BigInt(now() + 15000)) throw new Error('Latest block is stale or changed');
  };
  freshBlock();
  const call = async (abi, to, name, args = []) => abi.decodeFunctionResult(name,
    await request('eth_call', [{ to, data: abi.encodeFunctionData(name, args) }, blockTag]));
  if ((await call(tokenInterface, accountSyncToken, 'decimals'))[0] !== 6n
      || (await call(tokenState, accountSyncToken, 'paused'))[0]
      || (await call(tokenState, accountSyncToken, 'isBlacklisted', [shield.from]))[0]
      || (await call(tokenState, accountSyncToken, 'isBlacklisted', [proxyContract]))[0]) throw new Error('Test token is not available for this deposit');
  const [balance] = await call(tokenInterface, accountSyncToken, 'balanceOf', [shield.from]);
  if (balance < amount) throw new Error('Insufficient public test USDC');
  const [feeBps] = await call(walletInterface, proxyContract, 'shieldFee');
  const [received, fee] = await call(walletInterface, proxyContract, 'getFee', [amount, true, feeBps]);
  if (feeBps.toString() !== review.feeBps || received.toString() !== review.receivedUnits
      || fee.toString() !== review.feeUnits || received + fee !== amount) throw new Error('Protocol fee changed; create a new review');
  const [allowance] = await call(tokenInterface, accountSyncToken, 'allowance', [shield.from, proxyContract]);
  const stage = allowance < amount ? 'approval' : 'shield';
  const transaction = stage === 'shield' ? structuredClone(shield) : { ...shield,
    to: accountSyncToken, data: tokenInterface.encodeFunctionData('approve', [proxyContract, amount]) };
  const { chainId: _chain, ...callTransaction } = transaction;
  // No allowance overrides: simulate only the next executable transaction.
  const simulation = await request('eth_call', [callTransaction, blockTag]);
  if (stage === 'approval' ? tokenInterface.decodeFunctionResult('approve', simulation)[0] !== true : simulation !== '0x') {
    throw new Error('Transaction simulation did not succeed');
  }
  const estimate = quantity(await request('eth_estimateGas', [callTransaction, blockTag]));
  const gasLimit = (estimate * 120n + 99n) / 100n;
  if (estimate < 21000n || gasLimit > 2_000_000n) throw new Error('Gas estimate outside test limits');
  const priority = quantity(await request('eth_maxPriorityFeePerGas', []));
  const maxFeePerGas = 2n * quantity(block.baseFeePerGas) + priority;
  if (maxFeePerGas === 0n || maxFeePerGas > 50_000_000_000n) throw new Error('Network fee outside test limits');
  const maxNetworkFee = gasLimit * maxFeePerGas;
  const nativeBalance = quantity(await request('eth_getBalance', [shield.from, blockTag]));
  if (nativeBalance < maxNetworkFee) throw new Error('Insufficient Sepolia ETH for this transaction');
  const canonical = await request('eth_getBlockByNumber', [blockTag, false]);
  if (canonical?.hash !== block.hash || canonical?.number !== blockTag) throw new Error('Block changed during fee check');
  freshBlock(); check();
  const createdAt = now();
  const quote = { version: 1, status: 'simulated-not-submitted', submissionEnabled: false, reviewId,
    chainId: chain.id, stage, transaction, allowanceUnits: allowance.toString(),
    publicBalanceUnits: balance.toString(), nativeBalanceWei: nativeBalance.toString(),
    blockNumber: blockTag, blockHash: block.hash, blockTimestamp: block.timestamp,
    createdAt, expiresAt: Math.min(createdAt + gasQuoteLifetime, Number(quantity(block.timestamp)) * 1000 + 60000, review.expiresAt, expiresAt),
    gasEstimateUnits: estimate.toString(), gasLimitUnits: gasLimit.toString(),
    maxFeePerGasWei: maxFeePerGas.toString(), maxPriorityFeePerGasWei: priority.toString(),
    maxNetworkFeeWei: maxNetworkFee.toString(),
  };
  return { shieldReview: review, shieldPreflight: { ...quote, quoteId: keccak256(toUtf8Bytes(JSON.stringify(quote))) } };
}
