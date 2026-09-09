import { makeReadOnlyRpc, testNetwork } from './network-preflight.mjs';
export function syncProviderConfig(rpcURL) {
  makeReadOnlyRpc(rpcURL); // Apply the same transport rules as deployment checks.
  const { chain } = testNetwork('Ethereum_Sepolia');
  // SDK requires total weight >= 2. One trusted RPC is not independent quorum.
  return { chainId: chain.id, providers: [{ provider: rpcURL, priority: 1, weight: 2, maxLogsPerBatch: 10000 }] };
}
