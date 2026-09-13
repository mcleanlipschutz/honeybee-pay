import { makeReadOnlyRpc } from './network-preflight.mjs';
import { verifyFeeToken } from './fee-token.mjs';

try {
  const rpc = makeReadOnlyRpc(process.env.HONEYBEE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');
  const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
  const result = await verifyFeeToken(rpc, { blockNumber: block.number, blockHash: block.hash }, () => {});
  console.log(JSON.stringify({ status: 'fee-token-verified', network: 'Ethereum_Sepolia', ...result, paymentReady: false }));
} catch {
  console.log(JSON.stringify({ status: 'fee-token-unavailable', network: 'Ethereum_Sepolia', paymentReady: false }));
  process.exitCode = 1;
}
