import { makeReadOnlyRpc, testNetwork } from './network-preflight.mjs';
export function syncTimeoutMilliseconds(value = '90') {
  if (!/^[0-9]+$/.test(value)) throw new Error('Sync timeout must be whole seconds');
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 30 || seconds > 600) throw new Error('Sync timeout must be 30–600 seconds');
  return seconds * 1000;
}
export function syncProviderConfig(rpcURL) {
  makeReadOnlyRpc(rpcURL); // Apply the same transport rules as deployment checks.
  const { chain } = testNetwork('Ethereum_Sepolia');
  // SDK requires total weight >= 2. One trusted RPC is not independent quorum.
  return { chainId: chain.id, providers: [{ provider: rpcURL, priority: 1, weight: 2, maxLogsPerBatch: 10000 }] };
}
