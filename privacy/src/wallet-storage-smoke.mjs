import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { HDNodeWallet } from 'ethers';
import { ArtifactStore, startRailgunEngine, stopRailgunEngine, createRailgunWallet,
  loadWalletByID, validateRailgunAddress } from '@railgun-community/wallet';
import { createWalletDatabase } from './wallet-storage.mjs';

async function worker(message) {
  const database = await createWalletDatabase(message.directory);
  const unavailable = async () => { throw new Error('Offline storage check has no artifacts'); };
  try {
    await startRailgunEngine('honeybeepay', database, false,
      new ArtifactStore(unavailable, unavailable, unavailable), false, false);
    if (message.action === 'create') {
      const wallets = [];
      for (const mnemonic of message.mnemonics) {
        wallets.push(await createRailgunWallet(message.key, mnemonic, undefined));
      }
      assert(wallets.every(w => validateRailgunAddress(w.railgunAddress)));
      assert.notEqual(wallets[0].railgunAddress, wallets[1].railgunAddress);
      return { wallets: wallets.map(w => ({ id: w.id, address: w.railgunAddress })) };
    }
    if (message.action !== 'reload') throw new Error('Unknown storage check action');
    for (const wallet of message.wallets) {
      await assert.rejects(loadWalletByID(randomBytes(32).toString('hex'), wallet.id, false));
      const restored = await loadWalletByID(message.key, wallet.id, false);
      assert.equal(restored.railgunAddress, wallet.address);
    }
    return { reloaded: message.wallets.length, wrongKeyRejected: true };
  } finally { await stopRailgunEngine(); }
}

function runWorker(message) {
  return new Promise((resolve, reject) => {
    // Secrets travel only over a private IPC pipe, never arguments or env vars.
    const child = fork(fileURLToPath(import.meta.url), ['--worker'],
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
    let result;
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Storage worker failed')); });
    child.on('message', value => { result = value; });
    child.once('exit', code => {
      clearTimeout(timeout);
      if (code === 0 && result?.ok) resolve(result.value);
      else reject(new Error('Storage worker did not complete successfully'));
    });
    child.send(message, error => { if (error) child.kill('SIGKILL'); });
  });
}

export async function checkWalletStorage() {
  const directory = await mkdtemp(join(tmpdir(), 'honeybee-wallet-check-'));
  const keyBytes = randomBytes(32);
  const key = keyBytes.toString('hex');
  const mnemonics = Array.from({ length: 2 }, () => HDNodeWallet.createRandom().mnemonic.phrase);
  try {
    const created = await runWorker({ action: 'create', directory, key, mnemonics });
    // First child has exited and closed the database before this process starts.
    const restored = await runWorker({ action: 'reload', directory, key, wallets: created.wallets });
    assert.equal(restored.reloaded, 2);
    const files = await readdir(directory, { withFileTypes: true });
    assert(files.some(f => f.isFile()));
    for (const file of files.filter(f => f.isFile())) {
      const bytes = await readFile(join(directory, file.name));
      assert(!bytes.includes(keyBytes));
      assert(!bytes.includes(Buffer.from(key)));
      for (const mnemonic of mnemonics) assert(!bytes.includes(Buffer.from(mnemonic)));
    }
    return { status: 'persistent-wallet-check-passed', walletsCreated: 2,
      walletsRecoveredInFreshProcess: 2, wrongKeyRejected: restored.wrongKeyRejected,
      plaintextSeedOrKeyFound: false, temporaryDatabaseRemoved: true,
      funded: false, networkLoaded: false, paymentReady: false };
  } finally {
    keyBytes.fill(0);
    await rm(directory, { recursive: true, force: true });
    // JS strings cannot be reliably zeroed; the isolated processes must exit.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--worker') {
    process.once('message', async message => {
      try {
        const value = await worker(message);
        process.send({ ok: true, value }, () => process.exit(0));
      } catch { process.exit(1); }
    });
  } else {
    try { console.log(JSON.stringify(await checkWalletStorage())); }
    catch { console.error('Persistent wallet check failed. Wallet secrets are not included in this output.'); process.exitCode = 1; }
  }
}
