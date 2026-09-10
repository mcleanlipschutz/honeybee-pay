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

async function operate({ directory, session, action, password, backup, syncConfig }) {
  live(session);
  if (!isAbsolute(directory)) throw new Error();
  await privateDirectory(directory);
  const slot = join(directory, session.ownerId);
  const lock = join(directory, `${session.ownerId}.lock`);
  // Fail closed on an existing lock, including a stale lock after process death.
  await mkdir(lock, { mode: 0o700 });
  let engineStarted = false, createdSlot = false, completed = false;
  const signal = AbortSignal.timeout(accountSyncDeadline);
  const checkSession = () => { live(session); if (action === 'sync') signal.throwIfAborted(); };
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
    const prepared = action === 'sync' ? await prepareAccountSync(syncConfig, checkSession) : null;
    checkSession();
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
    const syncResult = prepared ? await scanAccountWallet({ sdk, wallet, prepared, checkSession, signal }) : null;
    if (prepared) await sdk.unloadProvider(accountSyncNetwork);
    await stopRailgunEngine(); engineStarted = false;
    checkSession();
    completed = true;
    return { ...readiness('locked', wallet), ...syncResult,
      recovery: action === 'create' ? 'backup-created' : action === 'restore' ? 'restored' : 'backup-verified',
      ...(['create', 'backup'].includes(action) ? { encryptedBackup: encrypted } : {}) };
  } finally {
    try {
      if (engineStarted && action === 'sync') { try { await sdk.unloadProvider(accountSyncNetwork); } catch { /* May not have loaded. */ } }
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
    try { process.send({ ok: true, value: await operate(message) }, () => process.exit(0)); }
    catch { process.exit(1); }
  });
}
