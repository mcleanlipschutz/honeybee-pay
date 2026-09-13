import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { createAccountAuthenticator } from './account-auth.mjs';
import { checkRecoveryPassword, accountBackupLimit } from './account-backup.mjs';
import { accountSyncConfig } from './account-sync.mjs';
import { validateHistoryBackup } from '../../shared/request-history-backup.mjs';
import { invoiceInput, invoiceValidation } from './account-invoice.mjs';
import { validatePrivateRequest } from '../../shared/private-request.mjs';
import { shieldInput } from './account-shield.mjs';
import { createShieldReviewCache } from './shield-review-cache.mjs';
import { syncDiagnosticStages, syncFailureDiagnostic } from './sync-diagnostic.mjs';
import { withAccountLock } from './account-lock.mjs';
import { paymentFeeLimit } from './account-private-payment.mjs';

let activeWorkers = 0;
function runWorker(message, onSyncDiagnostic) {
  // Bound expensive KDF/SDK processes even before a network rate limiter exists.
  if (activeWorkers >= 2) return Promise.reject(new Error('Account wallet operation failed'));
  activeWorkers += 1;
  const launch = () => new Promise((resolveResult, reject) => {
    const child = fork(fileURLToPath(new URL('./account-wallet-worker.mjs', import.meta.url)), [], {
      // Forks deliberately discard inherited CLI flags. Carry the reviewed
      // address preference explicitly into isolated wallet network requests.
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: ['--dns-result-order=ipv4first'],
    });
    let result, stage = 'worker-start', reason = 'CHECK_FAILED', timedOut = false;
    const budget = message.action === 'payment-submit' ? 900000 : message.action === 'payment-quote' ? 650000
      : ['sync', 'payment-check', 'payment-status', 'invoice-receipts'].includes(message.action) ? 320000
      : ['shield-review', 'shield-preflight'].includes(message.action) ? 120000 : 30000;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, budget);
    let workerError = false;
    child.once('error', () => { workerError = true; });
    child.on('message', value => {
      if (message.action.startsWith('payment-') && ['history-scan', 'broadcaster', 'fee-estimate', 'proof-generation', 'proof-verification', 'broadcast'].includes(value?.paymentStage)) {
        stage = value.paymentStage;
        if (typeof onSyncDiagnostic === 'function') { try { onSyncDiagnostic({ stage, reason: 'IN_PROGRESS' }); } catch {} }
      }
      else if (message.action === 'sync' && syncDiagnosticStages.includes(value?.syncStage)) stage = value.syncStage;
      else if (message.action === 'sync' && value?.ok === false) reason = syncFailureDiagnostic(stage, value.syncFailureReason).reason;
      else result = value;
    });
    // close also fires on spawn failure. Do not release the account lease on an
    // error event while an existing child might still be holding the database.
    child.once('close', code => {
      clearTimeout(timer);
      if (!workerError && code === 0 && result?.ok && Date.now() < message.session.expiresAt) resolveResult(result.value);
      else {
        if (message.action === 'sync' && typeof onSyncDiagnostic === 'function') {
          try { onSyncDiagnostic(syncFailureDiagnostic(stage, timedOut ? 'TIMEOUT' : reason)); }
          catch { /* Reporting must never change the rejected operation. */ }
        }
        reject(new Error('Account wallet operation failed'));
      }
    });
    // Passwords/backup data are neither process arguments nor log output.
    child.send(message, error => { if (error) child.kill('SIGKILL'); });
  });
  return (message.action === 'shield-preflight' ? launch()
    : withAccountLock(message.directory, message.session.ownerId, launch))
    .finally(() => { activeWorkers -= 1; });
}

export async function createAccountWalletService({ directory, appId, verificationKey, syncConfig, onSyncDiagnostic }) {
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
      const { action, password, backup, amount, publicAddress, assetId, reviewId, lifetimeSeconds, historyBackup, paymentRequest, maxFeeUnits, quoteId, hash } = request;
      const paymentAction = ['payment-quote', 'payment-submit', 'payment-status', 'payment-history'].includes(action);
      const usesNetwork = ['sync', 'shield-review', 'shield-preflight', 'payment-check', 'payment-quote', 'payment-submit', 'payment-status', 'invoice-receipts'].includes(action);
      const needsPassword = !['status', 'shield-preflight'].includes(action);
      const importsBackup = ['restore', 'verify-backup'].includes(action);
      const allowed = ['action', 'accessToken', ...(needsPassword ? ['password'] : []), ...(importsBackup ? ['backup'] : []), ...(action === 'shield-review' ? ['amount', 'publicAddress', 'assetId'] : []), ...(action === 'shield-preflight' ? ['reviewId'] : []), ...(action === 'invoice-create' ? ['amount', 'lifetimeSeconds'] : []), ...(action === 'invoice-history-restore' ? ['historyBackup'] : []), ...(['payment-check', 'payment-quote'].includes(action) ? ['paymentRequest'] : []), ...(action === 'payment-quote' ? ['maxFeeUnits'] : []), ...(['payment-submit', 'payment-status'].includes(action) ? ['quoteId'] : []), ...(action === 'payment-status' ? ['hash'] : [])];
      if (Object.keys(request).some(key => !allowed.includes(key))
          || !['status', 'create', 'unlock', 'backup', 'restore', 'verify-backup', 'sync', 'shield-review', 'shield-preflight', 'invoice-create', 'invoice-history', 'invoice-history-export', 'invoice-history-restore', 'payment-check', 'payment-quote', 'payment-submit', 'payment-status', 'payment-history', 'invoice-receipts'].includes(action)) throw new Error();
      if (usesNetwork && !synchronization) throw new Error();
      if (action === 'shield-review') shieldInput(amount, publicAddress, assetId);
      if (action === 'invoice-create') invoiceInput(amount, lifetimeSeconds);
      const checkedRequest = ['payment-check', 'payment-quote'].includes(action) ? validatePrivateRequest(paymentRequest, invoiceValidation()) : null;
      if (action === 'payment-quote') paymentFeeLimit(maxFeeUnits);
      if (['payment-submit', 'payment-status'].includes(action) && !/^0x[a-f0-9]{64}$/.test(quoteId)) throw new Error();
      if (action === 'payment-status' && hash !== undefined && !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error();
      const normalizedHistory = action === 'invoice-history-restore' ? validateHistoryBackup(historyBackup) : null;
      if (needsPassword) checkRecoveryPassword(password);
      if (importsBackup && (typeof backup !== 'string' || Buffer.byteLength(backup) > accountBackupLimit)) throw new Error();
      if (action === 'shield-preflight') return await shieldReviews.use(session, reviewId,
        review => runWorker({ session, action, review, syncConfig: synchronization }));
      if (action === 'shield-review') shieldReviews.discard(session);
      const result = await runWorker({ directory, session, action, password, backup,
        ...(action === 'shield-review' ? { amount, publicAddress, assetId } : {}),
        ...(action === 'invoice-create' ? { amount, lifetimeSeconds } : {}),
        ...(['payment-check', 'payment-quote'].includes(action) ? { paymentRequest: checkedRequest } : {}),
        ...(paymentAction ? { maxFeeUnits, quoteId, hash } : {}),
        ...(action === 'invoice-history-restore' ? { historyBackup: normalizedHistory } : {}),
        ...(usesNetwork ? { syncConfig: synchronization } : {}) }, onSyncDiagnostic);
      if (action === 'shield-review') shieldReviews.put(session, result.shieldReview);
      return result;
    } catch { throw new Error('Account wallet operation failed'); }
  } });
}
