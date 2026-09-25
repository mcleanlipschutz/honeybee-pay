import { syncDiagnosticStages, syncFailureDiagnostic } from './sync-diagnostic.mjs';
import { connectionErrorCode } from './rpc-transport.mjs';

// Terminal-only diagnostics. Never copy exception text, balances, account IDs,
// URLs, proof material or recovery data into IPC or the public HTTP response.
export const paymentDiagnosticStages = Object.freeze([...syncDiagnosticStages,
  'payment-runtime', 'payment-store', 'payment-validation', 'payment-balance',
  'broadcaster', 'fee-estimate', 'quote-validation', 'proof-generation',
  'proof-verification', 'broadcast', 'transaction-lookup', 'receipt-verification',
  'nullifier-check', 'chain-event-search', 'payment-outcome', 'redelivery-review', 'compatibility-check']);
// The pinned Waku SDK wraps a broadcaster response in this exact outer error.
// Inspect just its immediate cause; never emit or retain any response text.
const broadcasterReasons = new Map([
  ['Could not create valid transaction object.', 'BROADCAST_RELAY_REJECTED'],
  ['Bad token fee.', 'BROADCAST_FEE_REJECTED'],
  ['Gas Price was rejected as too low to guarantee inclusion into the next block.', 'BROADCAST_GAS_TOO_LOW'],
  ['Gas price rejected as too low.', 'BROADCAST_GAS_TOO_LOW'],
  ['Gas estimate error. Possible connection failure.', 'BROADCAST_GAS_ESTIMATE_FAILED'],
  ['Gas estimate error. Possible connection failure. Please try again.', 'BROADCAST_GAS_ESTIMATE_FAILED'],
  ['Transaction has already been sent.', 'BROADCAST_ALREADY_SENT'],
  ['Broadcaster does not support this network.', 'BROADCAST_NETWORK_UNSUPPORTED'],
  ['Missing required field.', 'BROADCAST_FIELD_MISSING'],
  ['No Broadcaster Fee included in transaction.', 'BROADCAST_FEE_MISSING'],
  ['Unknown Broadcaster error.', 'BROADCAST_UNKNOWN_ERROR'],
  ['Network Gas Price has changed dramatically and the Broadcaster Fee was rejected.', 'BROADCAST_FEE_CHANGED'],
  ['Failed to extract Broadcaster Fee from transaction. Please try again.', 'BROADCAST_FEE_EXTRACTION_FAILED'],
  ['Broadcaster is out of gas, or currently does not have enough to process this transaction.', 'BROADCAST_OUT_OF_GAS'],
  ['ALREADY SPENT: One of the notes contained in this transaction have already been spent!', 'BROADCAST_NOTE_SPENT'],
  ['RPC Rejected Transction: Gas fee too low. Please select a higher gas price and resubmit.', 'BROADCAST_GAS_TOO_LOW'],
  ['Could not validate Proof of Innocence - Broadcaster cannot process this transaction.', 'BROADCAST_POI_REJECTED'],
  ['RPC response is missing.', 'BROADCAST_RPC_RESPONSE_MISSING'],
]);
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
  ['Original delivery review expired or changed', 'ORIGINAL_DELIVERY_REVIEW_INVALID'],
  ['Original payment is not eligible for delivery retry', 'ORIGINAL_DELIVERY_INELIGIBLE'],
  ['Original payment network fee is no longer sufficient', 'ORIGINAL_DELIVERY_FEE_CHANGED'],
  ['Private note was already spent', 'ORIGINAL_NOTE_ALREADY_SPENT'],
  ['Compatible proof does not spend the original notes', 'ORIGINAL_NOTES_CHANGED'],
  ['This test payment needs one spendable note per token and change in both tokens. Choose a smaller payment or fund separate test deposits.', 'UNSUPPORTED_NOTE_SHAPE'],
]);
const allowedReasons = new Set([...applicationReasons.values(), ...broadcasterReasons.values(), 'IN_PROGRESS', 'ORIGINAL_NOTES_MATCHED',
  'ORIGINAL_DELIVERY_REVIEW_READY', 'ORIGINAL_DELIVERY_STARTED',
  'DELIVERY_REASON_NOT_RECORDED', 'BROADCAST_ACK_RECEIVED', 'TRANSACTION_CANDIDATE_FOUND',
  'NO_TRANSACTION_CANDIDATE', 'RECEIPT_UNAVAILABLE', 'RECEIPT_REJECTED',
  'NOTES_SPENT_AT_CHECK', 'NOTES_PARTLY_SPENT', 'NOTES_UNSPENT_AT_CHECK',
  'CHAIN_MATCH_FOUND', 'CHAIN_MATCH_NOT_FOUND_IN_WINDOW', 'CONFIRMED', 'PENDING', 'UNKNOWN', 'REVERTED']);

export function paymentFailureReason(error) {
  try {
    if (error?.message === 'Received response error from broadcaster.') {
      try { return broadcasterReasons.get(error.cause?.message) || 'BROADCAST_RESPONSE_ERROR'; }
      catch { return 'BROADCAST_RESPONSE_ERROR'; }
    }
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
