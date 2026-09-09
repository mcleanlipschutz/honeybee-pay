import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import memdown from 'memdown';
import { HDNodeWallet } from 'ethers';
import { groth16 } from 'snarkjs';
import { ArtifactStore, startRailgunEngine, stopRailgunEngine,
  createRailgunWallet, unloadWalletByID, loadWalletByID,
  validateRailgunAddress, getProver } from '@railgun-community/wallet';

// Run in its own process: the upstream SDK uses a singleton engine.
// Memory-only database and unfunded, disposable wallets. No network is loaded.
export async function checkEngine() {
  const database = memdown();
  const artifacts = new ArtifactStore(
    async () => { throw new Error('Artifacts are unavailable in the offline smoke test'); },
    async () => { throw new Error('Artifact writes are disabled in the offline smoke test'); },
    async () => false,
  );
  const keyBytes = randomBytes(32);
  const encryptionKey = keyBytes.toString('hex');
  try {
    await startRailgunEngine('honeybeepay', database, false, artifacts, false, false);
    if (typeof groth16.fullProve !== 'function' || typeof groth16.verify !== 'function') {
      throw new Error('Groth16 prover API is unavailable');
    }
    getProver().setSnarkJSGroth16(groth16);
    const buyer = await createRailgunWallet(encryptionKey, HDNodeWallet.createRandom().mnemonic.phrase, undefined);
    const merchant = await createRailgunWallet(encryptionKey, HDNodeWallet.createRandom().mnemonic.phrase, undefined);
    if (!validateRailgunAddress(buyer.railgunAddress) || !validateRailgunAddress(merchant.railgunAddress)
        || buyer.railgunAddress === merchant.railgunAddress) throw new Error('Wallet creation check failed');
    unloadWalletByID(buyer.id);
    let wrongKeyRejected = false;
    try { await loadWalletByID(randomBytes(32).toString('hex'), buyer.id, false); }
    catch { wrongKeyRejected = true; }
    if (!wrongKeyRejected) throw new Error('Incorrect encryption key was accepted');
    const restored = await loadWalletByID(encryptionKey, buyer.id, false);
    if (restored.railgunAddress !== buyer.railgunAddress) throw new Error('Wallet reload check failed');
    return { status: 'offline-engine-wallet-check-passed', walletsCreated: 2,
      encryptedWalletReloaded: true, wrongKeyRejected, proverRegistered: true,
      funded: false, proofGenerated: false, paymentReady: false };
  } finally {
    keyBytes.fill(0);
    // JS strings cannot be reliably zeroed; the isolated process must exit.
    await stopRailgunEngine();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await checkEngine())); }
  catch { console.error('Offline engine check failed. No wallet secrets are included in this output.'); process.exitCode = 1; }
}
