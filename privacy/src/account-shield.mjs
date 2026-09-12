import { randomBytes } from 'node:crypto';
import { getAddress, Interface, keccak256, toUtf8Bytes } from 'ethers';
import { RailgunEngine, ShieldNoteERC20 } from '@railgun-community/engine';
import { accountSyncNetwork, accountSyncToken } from './account-sync.mjs';
import { walletInterface } from './deployment-check.mjs';
import { makeReadOnlyRpc, testNetwork } from './network-preflight.mjs';
import { parseUSDC } from './private-transfer.mjs';

export const shieldReviewLifetime = 300000;
export const shieldTestLimit = 10_000_000n;
export const tokenInterface = new Interface([
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);

export function shieldInput(amount, publicAddress) {
  if (typeof amount !== 'string' || amount.length > 16) throw new Error('Invalid test amount');
  const units = parseUSDC(amount);
  if (units > shieldTestLimit) throw new Error('Test deposits are limited to 10 USDC');
  const from = getAddress(publicAddress);
  if (/^0x0{40}$/i.test(from)) throw new Error('A public funding wallet is required');
  return { units, from };
}

// Read-only review, never a signing authorization. The worker supplies the wallet
// recovered from its authenticated owner's backup; HTTP cannot supply a recipient.
export async function prepareShieldReview({ wallet, amount, publicAddress, prepared,
  checkSession, expiresAt, rpc = makeReadOnlyRpc(prepared.rpcURL), now = Date.now }) {
  checkSession();
  const { units, from } = shieldInput(amount, publicAddress);
  const { proxyContract, chain } = testNetwork(accountSyncNetwork);
  const { deployment } = prepared;
  if (deployment?.status !== 'reviewed-deployment-and-circuit-matched'
      || deployment.chainID !== chain.id || getAddress(deployment.proxy) !== getAddress(proxyContract)
      || deployment.proxyPaused !== false || deployment.verificationKeyMatches !== true
      || !/^0x[0-9a-fA-F]+$/.test(deployment.blockNumber)
      || !/^0x[0-9a-fA-F]{64}$/.test(deployment.blockHash)) throw new Error('Reviewed deployment required');
  if (!wallet?.id || !wallet.railgunAddress) throw new Error('Account wallet required');
  const blockTag = deployment.blockNumber;
  const call = async (abi, to, name, args = []) => {
    checkSession();
    const result = await rpc('eth_call', [{ to, data: abi.encodeFunctionData(name, args) }, blockTag]);
    checkSession();
    return abi.decodeFunctionResult(name, result);
  };
  const [decimals] = await call(tokenInterface, accountSyncToken, 'decimals');
  if (decimals !== 6n) throw new Error('Unexpected test-USDC decimals');
  const [balance] = await call(tokenInterface, accountSyncToken, 'balanceOf', [from]);
  if (balance < units) throw new Error('Insufficient test USDC at the reviewed block');
  const [allowance] = await call(tokenInterface, accountSyncToken, 'allowance', [from, proxyContract]);
  const [feeBps] = await call(walletInterface, proxyContract, 'shieldFee');
  if (feeBps < 0n || feeBps >= 10000n) throw new Error('Shield fee unavailable');
  // Ask the reviewed contract for its inclusive fee. Never substitute an assumed
  // fixed fee or floating-point estimate when the RPC cannot answer.
  const [received, fee] = await call(walletInterface, proxyContract, 'getFee', [units, true, feeBps]);
  if (received <= 0n || fee < 0n || received + fee !== units
      || fee !== units * feeBps / 10000n) throw new Error('Inconsistent shield fee');

  const { masterPublicKey, viewingPublicKey } = RailgunEngine.decodeAddress(wallet.railgunAddress);
  // Same Engine primitives used by Wallet SDK 10.9.0's generateShieldTransaction.
  // Fresh ephemeral key + random per review. The receiving wallet can decrypt
  // from its viewing key and onchain ciphertext after a restart; no signing key
  // or recovery secret is returned. Do not regenerate this note after approval.
  const shieldPrivateKey = randomBytes(32);
  let request;
  try {
    const note = new ShieldNoteERC20(masterPublicKey, randomBytes(16).toString('hex'), units, accountSyncToken);
    request = await note.serialize(shieldPrivateKey, viewingPublicKey);
  } finally { shieldPrivateKey.fill(0); }
  checkSession();
  const canonical = await rpc('eth_getBlockByNumber', [blockTag, false]);
  if (canonical?.hash !== deployment.blockHash || canonical?.number !== blockTag) throw new Error('Review block changed');
  const createdAt = now(), until = Math.min(createdAt + shieldReviewLifetime, expiresAt);
  if (!Number.isSafeInteger(until) || until <= createdAt) throw new Error('Account session expired');
  const unsigned = (to, data) => ({ chainId: chain.id, from, to: getAddress(to), value: '0x0', data });
  const approvalRequired = allowance < units;
  const review = {
    version: 1, status: 'prepared-not-submitted', submissionEnabled: false,
    network: accountSyncNetwork, chainId: chain.id, walletId: wallet.id,
    privateAddress: wallet.railgunAddress, publicAddress: from, token: accountSyncToken,
    amountUnits: units.toString(), feeBps: feeBps.toString(), feeUnits: fee.toString(),
    receivedUnits: received.toString(), publicBalanceUnits: balance.toString(),
    allowanceUnits: allowance.toString(), approvalRequired,
    approval: approvalRequired ? unsigned(accountSyncToken, tokenInterface.encodeFunctionData('approve', [proxyContract, units])) : null,
    transaction: unsigned(proxyContract, walletInterface.encodeFunctionData('shield', [[request]])),
    blockNumber: blockTag, blockHash: deployment.blockHash, createdAt, expiresAt: until,
    gasEstimate: null,
  };
  checkSession();
  // Correlates this exact randomized review; not a signature or authentication.
  const reviewId = keccak256(toUtf8Bytes(JSON.stringify(review)));
  return { shieldReview: { ...review, reviewId } };
}
