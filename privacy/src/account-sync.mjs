import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TXIDVersion } from '@railgun-community/shared-models';
import { createScanTracker } from './sync-state.mjs';
import { syncProviderConfig } from './sync-config.mjs';
import { makeReadOnlyRpc, testNetwork } from './network-preflight.mjs';
import { inspectDeployment } from './deployment-check.mjs';
import { createPinnedArtifactStore } from './artifact-store.mjs';
import { artifactDirectory, artifactManifest, artifactPrefix } from './proof-artifacts.mjs';
import { installRpcTransport } from './rpc-transport.mjs';
import { installTxidTransport } from './txid-transport.mjs';
import { installPOITransport } from './poi-transport.mjs';

export const accountSyncNetwork = 'Ethereum_Sepolia';
export const accountSyncToken = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
export const accountSyncDeadline = 90000;
export function accountSyncConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)
      || Object.keys(config).some(key => !['rpcURL', 'poiURL'].includes(key))) throw new Error('Private sync configuration unavailable');
  const { rpcURL, poiURL = 'https://ppoi.fdi.network' } = config;
  if (typeof rpcURL !== 'string' || typeof poiURL !== 'string') throw new Error('Private sync configuration unavailable');
  makeReadOnlyRpc(rpcURL);
  const poi = new URL(poiURL);
  if (poi.protocol !== 'https:' || poi.username || poi.password || poi.hash) throw new Error('Invalid POI endpoint');
  return Object.freeze({ rpcURL, poiURL });
}

// Trusted parent configuration only; endpoint selection is never accepted from HTTP.
export async function prepareAccountSync(config, checkSession, { blockTag = 'finalized' } = {}) {
  checkSession();
  const { rpcURL, poiURL } = accountSyncConfig(config);
  installRpcTransport(rpcURL); installTxidTransport(); installPOITransport(poiURL);
  const artifacts = await createPinnedArtifactStore(fileURLToPath(artifactDirectory), artifactManifest);
  const key = await artifacts.get(artifactPrefix + 'vkey.json');
  if (!key) throw new Error('Pinned verification key unavailable');
  const pins = JSON.parse(await readFile(new URL('../config/sepolia-deployment.json', import.meta.url), 'utf8'));
  const deployment = await inspectDeployment(accountSyncNetwork, makeReadOnlyRpc(rpcURL), pins, JSON.parse(key), { blockTag });
  checkSession();
  const response = await fetch(poiURL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1,
      method: 'ppoi_validated_txid', params: { chainType: '0', chainID: '11155111', txidVersion: 'V2_PoseidonMerkle' } }) });
  const poi = await response.json();
  if (!response.ok || poi.error || poi.id !== 1 || !Number.isSafeInteger(poi.result?.validatedTxidIndex)
      || poi.result.validatedTxidIndex < 0 || !/^[0-9a-fA-F]{64}$/.test(poi.result.validatedTxidMerkleroot)) throw new Error('POI service unavailable');
  checkSession();
  return { artifacts, deployment, rpcURL, poiURL };
}

export async function scanAccountWallet({ sdk, wallet, prepared, checkSession, signal }) {
  const { chain } = testNetwork(accountSyncNetwork);
  const version = TXIDVersion.V2_PoseidonMerkle;
  const tracker = createScanTracker(chain);
  let walletScanned = false;
  const check = () => { signal.throwIfAborted(); checkSession(); };
  sdk.setOnUTXOMerkletreeScanCallback(event => tracker.update('utxo', event));
  sdk.setOnTXIDMerkletreeScanCallback(event => tracker.update('txid', event));
  sdk.setOnBalanceUpdateCallback(event => {
    if (event.railgunWalletID === wallet.id && event.chain?.type === chain.type && event.chain?.id === chain.id
        && event.txidVersion === version) walletScanned = true;
  });
  try {
    check();
    await sdk.loadProvider(syncProviderConfig(prepared.rpcURL), accountSyncNetwork, 15000);
    check();
    // Never load the old shared buyer/merchant demo wallet list.
    await sdk.refreshBalances(chain, [wallet.id]);
    while (!tracker.complete() || !walletScanned) {
      check();
      if (Object.values(tracker.snapshot()).includes('Incomplete')) throw new Error('Incomplete wallet scan');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    check();
    const loaded = sdk.walletForID(wallet.id);
    if (loaded.id !== wallet.id) throw new Error('Wallet identity changed');
    // SDK onlySpendable=true filters out notes that are not eligible for spending.
    const units = await sdk.balanceForERC20Token(version, loaded, accountSyncNetwork, accountSyncToken, true);
    check();
    if (!tracker.complete() || typeof units !== 'bigint' || units < 0n || units >= 2n ** 256n) throw new Error('Spendable balance unavailable');
    return { synchronization: { status: 'history-scans-complete', checkedAt: new Date().toISOString(),
      scans: tracker.snapshot(), walletScanned: true, deployment: prepared.deployment },
      spendableBalanceVerified: true,
      spendableBalance: { token: accountSyncToken, decimals: 6, amountUnits: units.toString(), source: 'sdk-spendable-snapshot' },
      paymentReady: false, blockers: ['private-payment-not-integrated', ...(units === 0n ? ['no-spendable-test-usdc'] : [])] };
  } finally {
    sdk.setOnUTXOMerkletreeScanCallback(() => {});
    sdk.setOnTXIDMerkletreeScanCallback(() => {});
    sdk.setOnBalanceUpdateCallback(undefined);
  }
}
