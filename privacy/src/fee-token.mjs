import { Interface, keccak256 } from 'ethers';
import { feeWETH } from '../../shared/test-assets.mjs';

const abi = new Interface(['function decimals() view returns (uint8)', 'function symbol() view returns (string)']);
// Sourcify exact-match WETH9, match 1079487, solc 0.4.19. Source and deployed
// runtime matched on 2026-09-13; every use rechecks code and metadata on Sepolia.
export async function verifyFeeToken(rpc, deployment, checkSession) {
  checkSession();
  if (BigInt(await rpc('eth_chainId', [])) !== 11155111n) throw new Error('Wrong fee-token network');
  const block = deployment.blockNumber;
  const code = await rpc('eth_getCode', [feeWETH.token, block]);
  if (typeof code !== 'string' || keccak256(code) !== feeWETH.runtimeCodeHash) throw new Error('Fee-token contract changed');
  for (const [name, expected] of [['decimals', 18n], ['symbol', 'WETH']]) {
    const encoded = await rpc('eth_call', [{ to: feeWETH.token, data: abi.encodeFunctionData(name) }, block]);
    if (abi.decodeFunctionResult(name, encoded)[0] !== expected) throw new Error('Fee-token metadata changed');
    checkSession();
  }
  const canonical = await rpc('eth_getBlockByNumber', [block, false]);
  if (canonical?.number !== block || canonical?.hash !== deployment.blockHash) throw new Error('Fee-token verification block changed');
  checkSession();
  return { token: feeWETH.token, decimals: 18, runtimeCodeHash: feeWETH.runtimeCodeHash, blockNumber: block, blockHash: deployment.blockHash };
}
