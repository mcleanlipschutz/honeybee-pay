import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { createAccountAuthenticator } from './account-auth.mjs';
import { checkRecoveryPassword, accountBackupLimit } from './account-backup.mjs';

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
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
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

export async function createAccountWalletService({ directory, appId, verificationKey }) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || resolve(directory) !== directory) {
    throw new Error('Account storage path must be absolute and canonical');
  }
  const authenticate = await createAccountAuthenticator({ appId, verificationKey });
  // The public API accepts a token, never a caller-supplied owner, path or key.
  return Object.freeze({ async execute(request) {
    const session = await authenticate(request?.accessToken);
    try {
      if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error();
      const { action, password, backup } = request;
      const importsBackup = ['restore', 'verify-backup'].includes(action);
      const allowed = ['action', 'accessToken', ...(action === 'status' ? [] : ['password']), ...(importsBackup ? ['backup'] : [])];
      if (Object.keys(request).some(key => !allowed.includes(key))
          || !['status', 'create', 'unlock', 'backup', 'restore', 'verify-backup'].includes(action)) throw new Error();
      if (action !== 'status') checkRecoveryPassword(password);
      if (importsBackup && (typeof backup !== 'string' || Buffer.byteLength(backup) > accountBackupLimit)) throw new Error();
      return await runWorker({ directory, session, action, password, backup });
    } catch { throw new Error('Account wallet operation failed'); }
  } });
}
