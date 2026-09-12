import { mkdir, lstat, realpath, open, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HDNodeWallet, sha256, concat, toUtf8Bytes } from 'ethers';
import { RailgunWallet } from '@railgun-community/engine';
import { ArtifactStore, startRailgunEngine, stopRailgunEngine,
  createRailgunWallet, loadWalletByID } from '@railgun-community/wallet';
import { createWalletDatabase } from './wallet-storage.mjs';
import { accountBackupLimit, decryptAccountBackup, encryptAccountBackup } from './account-backup.mjs';
import * as sdk from '@railgun-community/wallet';
import { prepareAccountSync, scanAccountWallet, accountSyncDeadline, accountSyncNetwork } from './account-sync.mjs';
import { prepareShieldReview } from './account-shield.mjs';
import { createRequestHistoryStore } from './request-history.mjs';
import { createAccountInvoice } from './account-invoice.mjs';
import { checkAccountPayment } from './account-payment-check.mjs';
import { preflightShield } from './shield-preflight.mjs';
import { connectionErrorCode } from './rpc-transport.mjs';
import { syncFailureDiagnostic } from './sync-diagnostic.mjs';

const backupFile = 'account.backup.json';
function live(session) {
  if (!/^[a-f0-9]{64}$/.test(session?.ownerId) || !Number.isSafeInteger(session.expiresAt)
      || Date.now() >= session.expiresAt) throw new Error('Account session expired');
}
async function privateDirectory(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path
      || (process.platform !== 'win32' && ((info.mode & 0o777) !== 0o700 || info.uid !== process.getuid()))) {
    throw new Error('Account storage requires a private canonical directory');
  }
}
async function readBackup(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > accountBackupLimit || info.nlink !== 1
        || (process.platform !== 'win32' && ((info.mode & 0o777) !== 0o600 || info.uid !== process.getuid()))) throw new Error();
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
async function writeBackup(path, encrypted) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(encrypted, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
}
function readiness(walletStatus, wallet) {
  return { account: { authenticated: true },
    identityVerification: { status: 'deferred-for-testnet', verified: false, requiredForTestnet: false },
    privateWallet: { status: walletStatus, ...(wallet ? { id: wallet.id, privateAddress: wallet.railgunAddress } : {}) },
    network: 'Ethereum_Sepolia', networkLoaded: false, spendableBalanceVerified: false,
    paymentReady: false, blockers: [...(walletStatus === 'not-created' ? ['private-wallet-not-created'] : []), 'private-payment-not-integrated', 'balance-not-verified'] };
}

async function operate({ directory, session, action, password, backup, syncConfig, amount, publicAddress, review, lifetimeSeconds, historyBackup, paymentRequest }, onStage = () => {}) {
  live(session);
  if (action === 'shield-preflight') {
    // This branch never opens a wallet directory or receives a recovery password.
    const signal = AbortSignal.timeout(accountSyncDeadline);
    const checkSession = () => { live(session); signal.throwIfAborted(); };
    const prepared = await prepareAccountSync(syncConfig, checkSession, { blockTag: 'latest' });
    const quote = await preflightShield({ review, prepared, checkSession, expiresAt: session.expiresAt });
    checkSession();
    return { ...readiness('locked', { id: review.walletId, railgunAddress: review.privateAddress }), ...quote };
  }
  if (!isAbsolute(directory)) throw new Error();
  onStage('wallet-storage');
  await privateDirectory(directory);
  const slot = join(directory, session.ownerId);
  const lock = join(directory, `${session.ownerId}.lock`);
  // Fail closed on an existing lock, including a stale lock after process death.
  await mkdir(lock, { mode: 0o700 });
  let engineStarted = false, createdSlot = false, completed = false;
  const signal = AbortSignal.timeout(accountSyncDeadline);
  const usesNetwork = ['sync', 'shield-review', 'payment-check'].includes(action);
  const scansWallet = ['sync', 'payment-check'].includes(action);
  const checkSession = () => { live(session); if (usesNetwork) signal.throwIfAborted(); };
  try {
    live(session);
    let exists = true;
    try { await privateDirectory(slot); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
    if (action === 'status') {
      if (exists) { await readBackup(join(slot, backupFile)); await privateDirectory(join(slot, 'wallets')); }
      live(session);
      return readiness(exists ? 'locked' : 'not-created');
    }
    const initializing = action === 'create' || action === 'restore';
    if (initializing ? exists : !exists) throw new Error('Account wallet state does not allow this operation');
    let encrypted, root;
    onStage('wallet-recovery');
    if (action === 'create') {
      root = HDNodeWallet.createRandom();
      encrypted = await encryptAccountBackup(root.mnemonic.phrase, password, session.ownerId);
    } else {
      encrypted = ['restore', 'verify-backup'].includes(action) ? backup : await readBackup(join(slot, backupFile));
      root = HDNodeWallet.fromPhrase(await decryptAccountBackup(encrypted, password, session.ownerId));
    }
    live(session);
    if (initializing) {
      await mkdir(slot, { mode: 0o700 }); createdSlot = true;
      await writeBackup(join(slot, backupFile), encrypted);
    } else { await privateDirectory(join(slot, 'wallets')); }
    const prepared = usesNetwork ? await prepareAccountSync(syncConfig, checkSession, { onStage }) : null;
    checkSession();
    onStage('wallet-loading');
    const db = await createWalletDatabase(join(slot, 'wallets'));
    const unavailable = async () => { throw new Error('Account setup does not load proving artifacts'); };
    // Each process loads exactly one owner's engine, then exits. Sync is read-only.
    engineStarted = true;
    await startRailgunEngine('honeybeepay', db, false,
      prepared?.artifacts || new ArtifactStore(unavailable, unavailable, unavailable), false, false,
      prepared ? [prepared.poiURL] : undefined);
    const key = sha256(concat([toUtf8Bytes('honeybee:account-database:v1'), root.privateKey])).slice(2);
    const id = RailgunWallet.generateID(root.mnemonic.phrase, 0);
    const wallet = initializing ? await createRailgunWallet(key, root.mnemonic.phrase, undefined, 0)
      : await loadWalletByID(key, id, false);
    if (wallet.id !== id) throw new Error('Recovered wallet identity mismatch');
    const syncResult = action === 'sync' ? await scanAccountWallet({ sdk, wallet, prepared, checkSession, signal, onStage }) : null;
    const paymentResult = action === 'payment-check' ? await checkAccountPayment({ paymentRequest, sdk, wallet,
      prepared, checkSession, signal, expiresAt: session.expiresAt }) : null;
    const shieldResult = action === 'shield-review' ? await prepareShieldReview({ wallet, amount, publicAddress,
      prepared, checkSession, expiresAt: session.expiresAt }) : null;
    const invoiceResult = action === 'invoice-create' ? createAccountInvoice({ wallet, amount, lifetimeSeconds, checkSession }) : null;
    let requestHistory, historyBackupResult;
    if (['invoice-create', 'invoice-history', 'invoice-history-export', 'invoice-history-restore'].includes(action)) {
      const store = createRequestHistoryStore({ directory: slot, privateKey: root.privateKey,
        ownerId: session.ownerId, recipient: wallet.railgunAddress, checkSession });
      if (action === 'invoice-history-export') historyBackupResult = await store.exportBackup();
      else if (action === 'invoice-history-restore') historyBackupResult = await store.restoreBackup(historyBackup);
      else requestHistory = action === 'invoice-create' ? await store.append(invoiceResult.paymentRequest) : await store.read();
    }
    onStage('shutdown');
    if (scansWallet) await sdk.unloadProvider(accountSyncNetwork);
    await stopRailgunEngine(); engineStarted = false;
    checkSession();
    completed = true;
    return { ...readiness('locked', wallet), ...syncResult, ...shieldResult, ...invoiceResult, ...paymentResult,
      ...(requestHistory ? { requestHistory } : {}), ...historyBackupResult,
      recovery: action === 'create' ? 'backup-created' : action === 'restore' ? 'restored' : 'backup-verified',
      ...(['create', 'backup'].includes(action) ? { encryptedBackup: encrypted } : {}) };
  } finally {
    try {
      if (engineStarted && scansWallet) { try { await sdk.unloadProvider(accountSyncNetwork); } catch { /* May not have loaded. */ } }
      if (engineStarted) await stopRailgunEngine();
    }
    finally {
      try { if (createdSlot && !completed) await rm(slot, { recursive: true, force: true }); }
      finally { await rm(lock, { recursive: true }); }
    }
    // Decrypted JS strings cannot be reliably erased. The worker must exit.
  }
}

// This private IPC entry point accepts trusted parent messages, never HTTP.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.send) {
  process.once('message', async message => {
    const onStage = stage => {
      if (message.action !== 'sync' || !process.connected) return;
      try { process.send({ syncStage: syncFailureDiagnostic(stage).stage }, () => {}); }
      catch { /* Diagnostics cannot change the wallet operation. */ }
    };
    try { process.send({ ok: true, value: await operate(message, onStage) }, () => process.exit(0)); }
    catch (error) {
      if (message.action === 'sync' && process.connected) {
        const reason = error?.name === 'TimeoutError' ? 'TIMEOUT' : connectionErrorCode(error);
        process.send({ ok: false, syncFailureReason: syncFailureDiagnostic(undefined, reason).reason }, () => process.exit(1));
      } else process.exit(1);
    }
  });
}
