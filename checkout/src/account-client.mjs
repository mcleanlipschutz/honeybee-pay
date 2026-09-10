import { validateShieldReview } from './shield-review.mjs';
import { validateShieldPreflight } from './shield-preflight.mjs';

const messages = {
  'sign-in-required': 'Sign in again, then refresh your wallet status.',
  'try-later': 'The local wallet is busy. Wait a moment, then refresh its status.',
  'wallet-operation-failed': 'The wallet operation could not complete. Check your password, backup and local connection, then refresh wallet status. Existing wallets are never overwritten.',
  'request-too-large': 'Choose a Honeybee recovery file smaller than 8 KB.',
  'session-changed': 'Your account changed. Sign in and check your wallet again.',
  'connection-failed': 'The operation was not confirmed. Refresh wallet status before trying again.',
  'local-only': 'Private wallet setup requires the local testnet demo.',
  'preflight-failed': 'The network fee could not be verified. Check the local connection, test balances and deposit review, then try the fee check again. No funds were moved.',
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
  const execute = async (action, fields = {}, signal, expectedReview) => {
    current();
    try {
      fields = { ...fields };
      if (expectedReview) expectedReview = structuredClone(expectedReview);
      const token = await getAccessToken();
      current();
      if (!token || typeof token !== 'string') throw new AccountRequestError('sign-in-required');
      const response = await fetchImpl(`${origin}/api/account-wallet`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Honeybee-Request': 'wallet-v1', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...fields, action }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(['sync', 'shield-review', 'shield-preflight'].includes(action) ? 125000 : 35000)]) : AbortSignal.timeout(['sync', 'shield-review', 'shield-preflight'].includes(action) ? 125000 : 35000),
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
      if (action === 'sync' && (result.privateWallet.status !== 'locked'
          || result.synchronization?.status !== 'history-scans-complete'
          || result.synchronization?.scans?.utxo !== 'Complete' || result.synchronization?.scans?.txid !== 'Complete'
          || result.synchronization?.walletScanned !== true || !Number.isFinite(Date.parse(result.synchronization?.checkedAt))
          || result.spendableBalanceVerified !== true || result.spendableBalance?.decimals !== 6
          || result.spendableBalance?.token !== '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
          || result.spendableBalance?.source !== 'sdk-spendable-snapshot'
          || !/^(0|[1-9][0-9]{0,77})$/.test(result.spendableBalance?.amountUnits))) throw new Error();
      if (action === 'shield-review') {
        if (result.privateWallet.status !== 'locked' || result.spendableBalanceVerified !== false || result.networkLoaded !== false) throw new Error();
        result.shieldReview = validateShieldReview(result.shieldReview, { ...fields,
          walletId: result.privateWallet.id, privateAddress: result.privateWallet.privateAddress });
      }
      if (action === 'shield-preflight') {
        if (!expectedReview || result.privateWallet.status !== 'locked' || result.networkLoaded !== false
            || result.spendableBalanceVerified !== false || result.privateWallet.id !== expectedReview.walletId
            || result.privateWallet.privateAddress !== expectedReview.privateAddress
            || JSON.stringify(result.shieldReview) !== JSON.stringify(expectedReview)) throw new Error();
        result.shieldPreflight = validateShieldPreflight(result.shieldPreflight, expectedReview);
      }
      return result;
    } catch (error) {
      if (action === 'shield-preflight' && !['session-changed', 'sign-in-required'].includes(error.code)) throw new AccountRequestError('preflight-failed');
      if (error instanceof AccountRequestError) throw error;
      throw new AccountRequestError('connection-failed');
    }
  };
  return { execute, preflight: (review, signal) => execute('shield-preflight', { reviewId: review.reviewId }, signal, review) };
}

export async function readRecoveryFile(file) {
  if (!file || file.size > 8192 || file.size < 1) throw new AccountRequestError('request-too-large');
  return file.text();
}
