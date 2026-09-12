import { requestToken, validatePrivateRequest } from './private-request.mjs';

export const paymentCheckLifetime = 60000;
const invalid = () => new Error('The private balance check is unavailable, changed or expired. Check the request again.');
function units(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= 2n ** 256n) throw invalid();
  return BigInt(value);
}

export function validateSpendableSnapshot(value, { now = Date.now(), earliest = now - paymentCheckLifetime } = {}) {
  const sync = value?.synchronization, balance = value?.spendableBalance;
  const checkedAt = Date.parse(sync?.checkedAt);
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(earliest)
      || sync?.status !== 'history-scans-complete' || sync.scans?.utxo !== 'Complete'
      || sync.scans?.txid !== 'Complete' || sync.walletScanned !== true
      || !Number.isSafeInteger(checkedAt) || checkedAt < earliest || checkedAt > now + 5000
      || value.spendableBalanceVerified !== true || value.paymentReady !== false
      || balance?.token !== requestToken || balance.decimals !== 6
      || balance.source !== 'sdk-spendable-snapshot') throw invalid();
  units(balance.amountUnits);
  return { checkedAt, balanceUnits: balance.amountUnits };
}

// This is an expiring observation, never a quote, reservation or authorization.
export function validatePrivatePaymentCheck(value, { request, wallet, now = Date.now(), ...validation }) {
  const keys = ['version', 'status', 'request', 'walletId', 'buyerPrivateAddress', 'checkedAt', 'expiresAt',
    'balanceUnits', 'shortfallUnits', 'coversRequestedAmount', 'feesChecked', 'submissionEnabled'];
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))
        || value.version !== 1 || value.status !== 'balance-checked-not-authorized'
        || typeof wallet?.id !== 'string' || !wallet.id || wallet.id.length > 160
        || value.walletId !== wallet.id || value.buyerPrivateAddress !== wallet.privateAddress
        || value.feesChecked !== false || value.submissionEnabled !== false
        || !Number.isSafeInteger(now) || !Number.isSafeInteger(value.checkedAt)
        || !Number.isSafeInteger(value.expiresAt) || value.checkedAt <= 0 || value.checkedAt > now + 5000
        || value.expiresAt <= now || value.expiresAt <= value.checkedAt
        || value.expiresAt > value.checkedAt + paymentCheckLifetime) throw invalid();
    validation.validateRecipient(wallet.privateAddress);
    const expected = validatePrivateRequest(request, { ...validation, now: Math.floor(now / 1000) });
    const checkedRequest = validatePrivateRequest(value.request, { ...validation, now: Math.floor(now / 1000) });
    if (JSON.stringify(expected) !== JSON.stringify(checkedRequest) || value.expiresAt > expected.expiresAt * 1000) throw invalid();
    const available = units(value.balanceUnits), requested = units(expected.amountUnits);
    if (value.coversRequestedAmount !== (available >= requested)
        || units(value.shortfallUnits) !== (available < requested ? requested - available : 0n)) throw invalid();
    return Object.freeze({ ...value, request: expected });
  } catch { throw invalid(); }
}
