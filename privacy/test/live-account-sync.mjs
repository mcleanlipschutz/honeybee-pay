// Explicit public-testnet read test with a disposable, unfunded account. Never
// opens the user's account directory. Not part of the offline *.test.mjs suite.
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { accountFixture } from './account-fixture.mjs';
import { createAccountWalletService } from '../src/account-wallets.mjs';

const directory = await realpath(await mkdtemp(join(tmpdir(), 'hb-live-account-')));
const auth = await accountFixture(), accessToken = await auth.token();
const password = randomBytes(24).toString('hex'), start = Date.now();
const report = value => console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - start) / 1000), ...value }));
const service = await createAccountWalletService({ directory, ...auth,
  syncConfig: { rpcURL: process.env.HONEYBEE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    poiURL: process.env.HONEYBEE_POI_URL || 'https://ppoi.fdi.network' },
  onSyncDiagnostic: diagnostic => report({ diagnostic }),
});
try {
  await service.execute({ action: 'create', accessToken, password });
  report({ disposableWalletCreated: true });
  try {
    const value = await service.execute({ action: 'sync', accessToken, password });
    report({ synchronization: value.synchronization, spendableBalance: value.spendableBalance, paymentReady: false });
  } catch { report({ synchronizationFailed: true, paymentReady: false }); process.exitCode = 1; }
  try {
    await service.execute({ action: 'unlock', accessToken, password });
    report({ recoveryPassed: true });
  } catch { report({ recoveryPassed: false }); process.exitCode = 1; }
} finally { await rm(directory, { recursive: true, force: true }); }
