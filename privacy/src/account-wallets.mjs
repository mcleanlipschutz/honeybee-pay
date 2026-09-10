import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { createAccountAuthenticator } from './account-auth.mjs';
import { checkRecoveryPassword, accountBackupLimit } from './account-backup.mjs';
import { accountSyncConfig } from './account-sync.mjs';
import { validateHistoryBackup } from '../../shared/request-history-backup.mjs';
import { invoiceInput } from './account-invoice.mjs';
import { shieldInput } from './account-shield.mjs';
import { createShieldReviewCache } from './shield-review-cache.mjs';

let activeWorkers = 0;
function runWorker(message) {
  // Bound expensive KDF/SDK processes even before a network rate limiter exists.
  if (activeWorkers >= 2) return Promise.reject(new Error('Account wallet operation failed'));
  activeWorkers += 1;
  return new Promise((resolveResult, reject) => {
    const child = fork(fileURLToPath(new URL('./account-wallet-worker.mjs', import.meta.url)), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [],
    });
    let result;
    const timer = setTimeout(() => child.kill('SIGKILL'), ['sync', 'shield-review', 'shield-preflight'].includes(message.action) ? 120000 : 30000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Account wallet operation failed')); });
    child.on('message', value => { result = value; });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0 && result?.ok && Date.now() < message.session.expiresAt) resolveResult(result.value);
      else reject(new Error('Account wallet operation failed'));
    });
    // Passwords/backup data are neither process arguments nor log output.
    child.send(message, error => { if (error) child.kill('SIGKILL'); });
  }).finally(() => { activeWorkers -= 1; });
}

export async function createAccountWalletService({ directory, appId, verificationKey, syncConfig }) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || resolve(directory) !== directory) {
    throw new Error('Account storage path must be absolute and canonical');
  }
  const authenticate = await createAccountAuthenticator({ appId, verificationKey });
  const synchronization = syncConfig ? accountSyncConfig(syncConfig) : null;
  const shieldReviews = createShieldReviewCache();
  // The public API accepts a token, never a caller-supplied owner, path or key.
  return Object.freeze({ async execute(request) {
    const session = await authenticate(request?.accessToken);
    try {
      if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error();
      const { action, password, backup, amount, publicAddress, reviewId, lifetimeSeconds, historyBackup } = request;
      const usesNetwork = ['sync', 'shield-review', 'shield-preflight'].includes(action);
      const needsPassword = !['status', 'shield-preflight'].includes(action);
      const importsBackup = ['restore', 'verify-backup'].includes(action);
      const allowed = ['action', 'accessToken', ...(needsPassword ? ['password'] : []), ...(importsBackup ? ['backup'] : []), ...(action === 'shield-review' ? ['amount', 'publicAddress'] : []), ...(action === 'shield-preflight' ? ['reviewId'] : []), ...(action === 'invoice-create' ? ['amount', 'lifetimeSeconds'] : []), ...(action === 'invoice-history-restore' ? ['historyBackup'] : [])];
      if (Object.keys(request).some(key => !allowed.includes(key))
          || !['status', 'create', 'unlock', 'backup', 'restore', 'verify-backup', 'sync', 'shield-review', 'shield-preflight', 'invoice-create', 'invoice-history', 'invoice-history-export', 'invoice-history-restore'].includes(action)) throw new Error();
      if (usesNetwork && !synchronization) throw new Error();
      if (action === 'shield-review') shieldInput(amount, publicAddress);
      if (action === 'invoice-create') invoiceInput(amount, lifetimeSeconds);
      const normalizedHistory = action === 'invoice-history-restore' ? validateHistoryBackup(historyBackup) : null;
      if (needsPassword) checkRecoveryPassword(password);
      if (importsBackup && (typeof backup !== 'string' || Buffer.byteLength(backup) > accountBackupLimit)) throw new Error();
      if (action === 'shield-preflight') return await shieldReviews.use(session, reviewId,
        review => runWorker({ session, action, review, syncConfig: synchronization }));
      if (action === 'shield-review') shieldReviews.discard(session);
      const result = await runWorker({ directory, session, action, password, backup,
        ...(action === 'shield-review' ? { amount, publicAddress } : {}),
        ...(action === 'invoice-create' ? { amount, lifetimeSeconds } : {}),
        ...(action === 'invoice-history-restore' ? { historyBackup: normalizedHistory } : {}),
        ...(usesNetwork ? { syncConfig: synchronization } : {}) });
      if (action === 'shield-review') shieldReviews.put(session, result.shieldReview);
      return result;
    } catch { throw new Error('Account wallet operation failed'); }
  } });
}
