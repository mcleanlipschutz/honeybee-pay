const messages = {
  'sign-in-required': 'Sign in again, then refresh your wallet status.',
  'try-later': 'The local wallet is busy. Wait a moment, then refresh its status.',
  'wallet-operation-failed': 'The wallet operation could not complete. Check your password and backup, then refresh wallet status. Existing wallets are never overwritten.',
  'request-too-large': 'Choose a Honeybee recovery file smaller than 8 KB.',
  'session-changed': 'Your account changed. Sign in and check your wallet again.',
  'connection-failed': 'The operation was not confirmed. Refresh wallet status before trying again.',
  'local-only': 'Private wallet setup requires the local testnet demo.',
};
export class AccountRequestError extends Error {
  constructor(code) { super(messages[code] || messages['connection-failed']); this.code = code; }
}
export function isLocalDemo(origin) {
  try { const url = new URL(origin); return url.origin === origin && url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port; }
  catch { return false; }
}
export function createAccountWalletClient({ origin, getAccessToken, isCurrent = () => true, fetchImpl = fetch }) {
  if (!isLocalDemo(origin)) throw new AccountRequestError('local-only');
  const current = () => { if (!isCurrent()) throw new AccountRequestError('session-changed'); };
  return { async execute(action, fields = {}, signal) {
    current();
    try {
      const token = await getAccessToken();
      current();
      if (!token || typeof token !== 'string') throw new AccountRequestError('sign-in-required');
      const response = await fetchImpl(`${origin}/api/account-wallet`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Honeybee-Request': 'wallet-v1', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...fields, action }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000),
      });
      current();
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error();
      const result = await response.json();
      current();
      if (!response.ok) throw new AccountRequestError(result.error);
      if (result?.account?.authenticated !== true || result.network !== 'Ethereum_Sepolia'
          || result.paymentReady !== false || result.identityVerification?.verified !== false
          || result.identityVerification?.status !== 'deferred-for-testnet'
          || !['not-created', 'locked'].includes(result.privateWallet?.status)) throw new Error();
      return result;
    } catch (error) {
      if (error instanceof AccountRequestError) throw error;
      throw new AccountRequestError('connection-failed');
    }
  } };
}

export async function readRecoveryFile(file) {
  if (!file || file.size > 8192 || file.size < 1) throw new AccountRequestError('request-too-large');
  return file.text();
}
