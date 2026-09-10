import { validatePrivateRequest } from '../../shared/private-request.mjs';
import { paymentCheckLifetime, validatePrivatePaymentCheck, validateSpendableSnapshot } from '../../shared/private-payment-check.mjs';
import { invoiceValidation } from './account-invoice.mjs';
import { scanAccountWallet } from './account-sync.mjs';

// The worker supplies its recovered wallet and trusted network configuration.
// HTTP callers cannot supply a balance, wallet selector or scan result.
export async function checkAccountPayment({ paymentRequest, wallet, expiresAt, checkSession, now = Date.now,
  scan = scanAccountWallet, ...scanOptions }) {
  checkSession();
  const startedAt = now();
  const request = validatePrivateRequest(paymentRequest, invoiceValidation(Math.floor(startedAt / 1000)));
  const buyer = { id: wallet.id, privateAddress: wallet.railgunAddress };
  if (!buyer.id) throw new Error('An account wallet is required');
  const snapshot = await scan({ ...scanOptions, wallet, checkSession });
  checkSession();
  const finishedAt = now();
  const { checkedAt, balanceUnits } = validateSpendableSnapshot(snapshot, { now: finishedAt, earliest: startedAt });
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= finishedAt) throw new Error('Account session expired');
  const available = BigInt(balanceUnits), requested = BigInt(request.amountUnits);
  const paymentCheck = validatePrivatePaymentCheck({ version: 1, status: 'balance-checked-not-authorized',
    request, walletId: buyer.id, buyerPrivateAddress: buyer.privateAddress, checkedAt,
    expiresAt: Math.min(checkedAt + paymentCheckLifetime, request.expiresAt * 1000, expiresAt),
    balanceUnits, shortfallUnits: (available < requested ? requested - available : 0n).toString(),
    coversRequestedAmount: available >= requested, feesChecked: false, submissionEnabled: false,
  }, { request, wallet: buyer, ...invoiceValidation(), now: finishedAt });
  checkSession();
  return { ...snapshot, paymentCheck, paymentReady: false,
    blockers: ['private-payment-not-integrated', 'private-payment-fees-not-checked',
      ...(!paymentCheck.coversRequestedAmount ? ['insufficient-private-test-usdc'] : [])] };
}
