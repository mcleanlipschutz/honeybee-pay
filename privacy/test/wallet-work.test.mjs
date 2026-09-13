import test from 'node:test';
import assert from 'node:assert/strict';
import { trackWalletWork } from '../src/wallet-work.mjs';

test('wallet shutdown waits for background work spawned by decryption', async () => {
  let release, finished = false;
  const wallet = {
    async decryptBalances() { void this.refreshPOIsForTXIDVersion(); },
    async refreshPOIsForTXIDVersion() { await new Promise(r => { release = r; }); finished = true; },
  };
  const tracked = trackWalletWork(wallet);
  await wallet.decryptBalances();
  let drained = false;
  const drain = tracked.drain(() => {}).then(() => { drained = true; });
  await new Promise(r => setImmediate(r));
  assert.equal(drained, false); assert.throws(() => tracked.restore());
  release(); await drain; assert.equal(finished, true); tracked.restore();
});

test('an otherwise unhandled background failure rejects the account operation', async () => {
  const wallet = {
    async decryptBalances() { this.refreshPOIsForTXIDVersion().then(() => {}); },
    async refreshPOIsForTXIDVersion() { throw new Error('POI read failed'); },
  };
  const tracked = trackWalletWork(wallet);
  await wallet.decryptBalances();
  await assert.rejects(tracked.drain(() => {}), /POI read failed/);
  assert.throws(() => tracked.check(), /POI read failed/); tracked.restore();
});
