import { mkdir, lstat, readFile, writeFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { HDNodeWallet, Wallet, sha256, concat, toUtf8Bytes } from 'ethers';
import { RailgunWallet, Mnemonic } from '@railgun-community/engine';
import { startRailgunEngine, stopRailgunEngine, createRailgunWallet, loadWalletByID } from '@railgun-community/wallet';
import { createWalletDatabase } from './wallet-storage.mjs';
import { createPinnedArtifactStore } from './artifact-store.mjs';
import { artifactManifest, artifactDirectory } from './proof-artifacts.mjs';
import { fileURLToPath } from 'node:url';

export const testNetworkName = 'Ethereum_Sepolia';
export const demoRoles = Object.freeze(['buyer', 'merchant', 'attacker']);
const backupName = 'root.keystore.json';

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('Use a test-workspace password between 12 and 256 characters');
  }
}
async function decryptRoot(encrypted, password) {
  checkPassword(password);
  if (Buffer.byteLength(encrypted) > 1024 * 1024) throw new Error('Backup exceeds size limit');
  const envelope = JSON.parse(encrypted);
  const crypto = envelope.Crypto;
  // Accept our standard ethers backup format; bound KDF work before decryption.
  if (envelope.version !== 3 || crypto?.kdf !== 'scrypt'
      || crypto.kdfparams.n !== 131072 || crypto.kdfparams.r !== 8
      || crypto.kdfparams.p !== 1 || crypto.kdfparams.dklen !== 32) {
    throw new Error('Unsupported test-workspace backup format');
  }
  const root = await Wallet.fromEncryptedJson(encrypted, password);
  if (!root.mnemonic?.phrase) throw new Error('Backup must contain an encrypted HD mnemonic');
  return root;
}
async function readBackup(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw new Error('Invalid encrypted backup file');
  return readFile(path, 'utf8');
}
export async function readWorkspaceRoot(directory, password) {
  if (!isAbsolute(directory)) throw new Error('Workspace path must be absolute');
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
      || (process.platform !== 'win32' && ((info.mode & 0o777) !== 0o700 || info.uid !== process.getuid()))) {
    throw new Error('Workspace must be a private directory owned by the current user');
  }
  return decryptRoot(await readBackup(join(directory, backupName)), password);
}

export function databaseKey(root) {
  return sha256(concat([toUtf8Bytes('honeybee:test-database:v1'), root.privateKey])).slice(2);
}
export async function startWorkspaceEngine(directory, poiNodeURLs) {
  const db = await createWalletDatabase(join(directory, 'wallets'));
  const artifacts = await createPinnedArtifactStore(fileURLToPath(artifactDirectory), artifactManifest);
  await startRailgunEngine('honeybeepay', db, false, artifacts, false, false, poiNodeURLs);
}
export async function loadWorkspaceWallets(root) {
  const key = databaseKey(root);
  const wallets = [];
  for (const [index, role] of demoRoles.entries()) {
    const id = RailgunWallet.generateID(root.mnemonic.phrase, index);
    const wallet = await loadWalletByID(key, id, false);
    wallets.push({ role, id, privateAddress: wallet.railgunAddress,
      publicAddress: Mnemonic.to0xAddress(root.mnemonic.phrase, index) });
  }
  return wallets;
}

// A workspace is a single-owner demo: the roles are distinct derived accounts,
// not three independent custodians. All are recoverable from one encrypted root.
export async function initializeTestWorkspace(directory, password, backupPath) {
  checkPassword(password);
  if (!isAbsolute(directory)) throw new Error('Workspace path must be absolute');
  const encrypted = backupPath ? await readBackup(backupPath)
    : await HDNodeWallet.createRandom().encrypt(password);
  const root = await decryptRoot(encrypted, password);
  // Atomic directory creation prevents overwriting an existing wallet workspace.
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, backupName), encrypted, { flag: 'wx', mode: 0o600 });
  try {
    await startWorkspaceEngine(directory);
    for (const index of demoRoles.keys()) {
      await createRailgunWallet(databaseKey(root), root.mnemonic.phrase, undefined, index);
    }
    return { status: backupPath ? 'test-workspace-restored' : 'test-workspace-created',
      network: testNetworkName, wallets: await loadWorkspaceWallets(root),
      backupFile: backupName, synchronized: false, paymentReady: false };
  } finally { await stopRailgunEngine(); }
}

export async function inspectTestWorkspace(directory, password) {
  const root = await readWorkspaceRoot(directory, password);
  // A status read must not silently rebuild a missing wallet database.
  if (!(await lstat(join(directory, 'wallets'))).isDirectory()) throw new Error('Wallet database missing');
  try {
    await startWorkspaceEngine(directory);
    return { status: 'test-workspace-unlocked', network: testNetworkName,
      wallets: await loadWorkspaceWallets(root), synchronized: false, paymentReady: false };
  } finally { await stopRailgunEngine(); }
}
