import { syncDiagnosticStages, syncFailureDiagnostic } from './sync-diagnostic.mjs';
import { connectionErrorCode } from './rpc-transport.mjs';

// Terminal-only diagnostics. Never copy exception text, balances, account IDs,
// URLs, proof material or recovery data into IPC or the public HTTP response.
export const paymentDiagnosticStages = Object.freeze([...syncDiagnosticStages,
  'payment-runtime', 'payment-store', 'payment-validation', 'payment-balance',
  'broadcaster', 'fee-estimate', 'quote-validation', 'proof-generation',
  'proof-verification', 'broadcast', 'transaction-lookup', 'receipt-verification',
  'nullifier-check', 'chain-event-search', 'payment-outcome']);
const applicationReasons = new Map([
  ['Incomplete wallet scan', 'SCAN_INCOMPLETE'],
  ['Spendable balance unavailable', 'BALANCE_UNAVAILABLE'],
  ['Spendable fee balance unavailable', 'FEE_BALANCE_UNAVAILABLE'],
  ['Wallet identity changed', 'WALLET_CHANGED'],
  ['Account session expired', 'SESSION_EXPIRED'],
  ['More spendable private test USDC is required for the merchant amount', 'INSUFFICIENT_PRIVATE_USDC'],
  ['Deposit Sepolia WETH for the private broadcaster fee first', 'PRIVATE_WETH_REQUIRED'],
  ['Insufficient spendable private Sepolia WETH for the fee', 'INSUFFICIENT_PRIVATE_WETH'],
  ['Broadcaster fee exceeds your limit', 'FEE_LIMIT_EXCEEDED'],
  ['Private payment broadcaster unavailable', 'BROADCASTER_UNAVAILABLE'],
  ['Quoted broadcaster fee unavailable', 'BROADCASTER_QUOTE_UNAVAILABLE'],
  ['Invalid broadcaster fee', 'BROADCASTER_FEE_INVALID'],
  ['Broadcaster fee expired', 'BROADCASTER_FEE_EXPIRED'],
  ['Network fee exceeds the test limit', 'NETWORK_FEE_LIMIT'],
  ['Invalid private payment gas estimate', 'GAS_ESTIMATE_INVALID'],
  ['Private payment quote expired or changed', 'QUOTE_INVALID_OR_EXPIRED'],
  ['Prepare pinned transfer artifacts first', 'TRANSFER_ARTIFACTS_MISSING'],
  ['Pinned verification key unavailable', 'VERIFICATION_KEY_MISSING'],
  ['Choose a separate merchant wallet', 'RECIPIENT_IS_BUYER'],
  ['Check the unfinished private payment before another attempt', 'UNFINISHED_PAYMENT'],
  ['This request already has a payment attempt', 'REQUEST_ALREADY_ATTEMPTED'],
  ['Private balance changed', 'PRIVATE_BALANCE_CHANGED'],
  ['Request timed out.', 'BROADCAST_RESPONSE_TIMEOUT'],
  ['Received response error from broadcaster.', 'BROADCAST_RESPONSE_ERROR'],
  ['Invalid private transaction hash', 'BROADCAST_ACK_INVALID'],
  ['Recovery lookup budget exceeded', 'RECOVERY_LOOKUP_TIMEOUT'],
  ['This test payment needs one spendable note per token and change in both tokens. Choose a smaller payment or fund separate test deposits.', 'UNSUPPORTED_NOTE_SHAPE'],
]);
const allowedReasons = new Set([...applicationReasons.values(), 'IN_PROGRESS',
  'DELIVERY_REASON_NOT_RECORDED', 'BROADCAST_ACK_RECEIVED', 'TRANSACTION_CANDIDATE_FOUND',
  'NO_TRANSACTION_CANDIDATE', 'RECEIPT_UNAVAILABLE', 'RECEIPT_REJECTED',
  'NOTES_SPENT_AT_CHECK', 'NOTES_PARTLY_SPENT', 'NOTES_UNSPENT_AT_CHECK',
  'CHAIN_MATCH_FOUND', 'CHAIN_MATCH_NOT_FOUND_IN_WINDOW', 'CONFIRMED', 'PENDING', 'UNKNOWN', 'REVERTED']);

export function paymentFailureReason(error) {
  try {
    if (applicationReasons.has(error?.message)) return applicationReasons.get(error.message);
    if (error?.name === 'TimeoutError') return 'TIMEOUT';
    if (error?.name === 'AbortError') return 'CANCELLED';
    return connectionErrorCode(error);
  } catch { return 'SDK_ERROR'; }
}

// The parent validates again rather than trusting arbitrary IPC strings.
export function paymentFailureDiagnostic(stage, reason) {
  return Object.freeze({
    stage: paymentDiagnosticStages.includes(stage) ? stage : 'worker-start',
    reason: allowedReasons.has(reason) ? reason : syncFailureDiagnostic(undefined, reason).reason,
  });
}
