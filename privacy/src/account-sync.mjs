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
import { checkPOIService } from './poi-preflight.mjs';

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
export async function prepareAccountSync(config, checkSession, { blockTag = 'finalized', onStage = () => {} } = {}) {
  checkSession();
  const { rpcURL, poiURL } = accountSyncConfig(config);
  // Reject a wrong network even in a fresh checkout with no artifact cache.
  // Deployment inspection repeats this check before its pinned contract reads.
  const rpc = makeReadOnlyRpc(rpcURL);
  onStage('rpc-connection');
  const chainID = await rpc('eth_chainId', []);
  checkSession();
  if (typeof chainID !== 'string' || !/^0x[0-9a-fA-F]{1,16}$/.test(chainID)
      || BigInt(chainID) !== BigInt(testNetwork(accountSyncNetwork).chain.id)) throw new Error('RPC chain does not match configuration');
  installRpcTransport(rpcURL); installTxidTransport(); installPOITransport(poiURL);
  onStage('artifact-check');
  const artifacts = await createPinnedArtifactStore(fileURLToPath(artifactDirectory), artifactManifest);
  const key = await artifacts.get(artifactPrefix + 'vkey.json');
  if (!key) throw new Error('Pinned verification key unavailable');
  const pins = JSON.parse(await readFile(new URL('../config/sepolia-deployment.json', import.meta.url), 'utf8'));
  onStage('deployment-check');
  const deployment = await inspectDeployment(accountSyncNetwork, rpc, pins, JSON.parse(key), { blockTag });
  checkSession();
  onStage('poi-service');
  await checkPOIService(poiURL, checkSession);
  checkSession();
  return { artifacts, deployment, rpcURL, poiURL };
}

export async function scanAccountWallet({ sdk, wallet, prepared, checkSession, signal, onStage = () => {} }) {
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
    onStage('provider-loading');
    await sdk.loadProvider(syncProviderConfig(prepared.rpcURL), accountSyncNetwork, 15000);
    check();
    // Never load the old shared buyer/merchant demo wallet list.
    onStage('history-scan');
    await sdk.refreshBalances(chain, [wallet.id]);
    let waitingStage;
    while (!tracker.complete() || !walletScanned) {
      const snapshot = tracker.snapshot();
      const nextStage = snapshot.utxo === 'Incomplete' ? 'utxo-history'
        : snapshot.txid === 'Incomplete' ? 'txid-history'
        : snapshot.utxo !== 'Complete' ? 'utxo-history'
        : snapshot.txid !== 'Complete' ? 'txid-history' : 'wallet-balance';
      if (nextStage !== waitingStage) { waitingStage = nextStage; onStage(nextStage); }
      check();
      if (Object.values(tracker.snapshot()).includes('Incomplete')) {
        throw new Error('Incomplete wallet scan');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    check();
    onStage('balance-read');
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
