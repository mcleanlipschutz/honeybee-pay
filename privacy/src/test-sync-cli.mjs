import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProvider, unloadProvider, stopRailgunEngine, refreshBalances,
  setOnUTXOMerkletreeScanCallback, setOnTXIDMerkletreeScanCallback } from '@railgun-community/wallet';
import { readWorkspaceRoot, startWorkspaceEngine, loadWorkspaceWallets, testNetworkName } from './test-workspace.mjs';
import { readSecret } from './secret-input.mjs';
import { createScanTracker } from './sync-state.mjs';
import { syncProviderConfig } from './sync-config.mjs';
import { installRpcTransport, connectionErrorCode } from './rpc-transport.mjs';
import { makeReadOnlyRpc, testNetwork } from './network-preflight.mjs';
import { inspectDeployment } from './deployment-check.mjs';
import { createPinnedArtifactStore } from './artifact-store.mjs';
import { artifactDirectory, artifactManifest, artifactPrefix } from './proof-artifacts.mjs';

// Isolated process: a deadline terminates SDK requests and releases the DB lock.
let stage = 'configuration';
let directory;
let tracker;
let deployment;
let timer;
let finishing = false;
let errorCode;
let providerConnected = false;
async function finish(status, code) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timer);
  const result = { status, stage, network: testNetworkName, checkedAt: new Date().toISOString(),
    scans: tracker?.snapshot(), deployment, errorCode, providerConnected, synchronized: status === 'history-scans-complete',
    paymentReady: false };
  // Bound shutdown even when an SDK request cannot be cancelled.
  const hardStop = setTimeout(() => process.exit(code), 3000);
  try {
    if (directory) {
      const temporary = join(directory, `sync-status.${process.pid}.tmp`);
      await writeFile(temporary, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(directory, 'sync-status.json'));
    }
    console.log(JSON.stringify(result));
    try { await unloadProvider(testNetworkName); } catch { /* May not have loaded. */ }
    try { await stopRailgunEngine(); } catch { /* May not have started. */ }
  } catch { console.error('Could not persist synchronization status.'); code = 1; }
  clearTimeout(hardStop);
  process.exit(code);
}
try {
  if (process.argv.length !== 3 || !process.env.HONEYBEE_RPC_URL) throw new Error();
  const rpcURL = process.env.HONEYBEE_RPC_URL;
  const rpc = makeReadOnlyRpc(rpcURL);
  installRpcTransport(rpcURL);
  const poiURL = process.env.HONEYBEE_POI_URL || 'https://ppoi.fdi.network';
  if (new URL(poiURL).protocol !== 'https:') throw new Error();
  const root = await readWorkspaceRoot(resolve(process.argv[2]), await readSecret());
  directory = resolve(process.argv[2]);
  const pending = join(directory, `sync-status.${process.pid}.tmp`);
  await writeFile(pending, JSON.stringify({ status: 'sync-running', synchronized: false, paymentReady: false,
    startedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
  await rename(pending, join(directory, 'sync-status.json'));
  timer = setTimeout(() => void finish('sync-timeout', 1), 90000);
  process.once('SIGINT', () => void finish('sync-interrupted', 1));
  process.once('SIGTERM', () => void finish('sync-interrupted', 1));
  stage = 'deployment-verification';
  const pins = JSON.parse(await readFile(new URL('../config/sepolia-deployment.json', import.meta.url), 'utf8'));
  const store = await createPinnedArtifactStore(fileURLToPath(artifactDirectory), artifactManifest);
  const key = await store.get(artifactPrefix + 'vkey.json');
  if (!key) throw new Error();
  deployment = await inspectDeployment(testNetworkName, rpc, pins, JSON.parse(key));
  stage = 'poi-availability';
  const response = await fetch(poiURL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1,
      method: 'ppoi_validated_txid', params: { chainType: '0', chainID: '11155111', txidVersion: 'V2_PoseidonMerkle' } }) });
  const poi = await response.json();
  if (!response.ok || poi.error || poi.id !== 1 || !Number.isSafeInteger(poi.result?.validatedTxidIndex)
      || poi.result.validatedTxidIndex < 0 || !/^[0-9a-fA-F]{64}$/.test(poi.result.validatedTxidMerkleroot)) throw new Error();
  stage = 'wallet-loading';
  await startWorkspaceEngine(directory, [poiURL]);
  const wallets = await loadWorkspaceWallets(root);
  const { chain } = testNetwork(testNetworkName);
  tracker = createScanTracker(chain);
  setOnUTXOMerkletreeScanCallback(event => tracker.update('utxo', event));
  setOnTXIDMerkletreeScanCallback(event => tracker.update('txid', event));
  stage = 'provider-loading';
  await loadProvider(syncProviderConfig(rpcURL), testNetworkName, 15000);
  providerConnected = true;
  stage = 'history-scanning';
  await refreshBalances(chain, wallets.map(wallet => wallet.id));
  // SDK completion callbacks may follow the refresh promise asynchronously.
  while (!tracker.complete() && !finishing) await new Promise(resolve => setTimeout(resolve, 100));
  if (!finishing) await finish('history-scans-complete', 0);
} catch (error) { errorCode = connectionErrorCode(error); await finish('sync-failed', 1); }
