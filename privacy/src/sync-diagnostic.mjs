// Only fixed labels cross the worker boundary. No exception text, URLs,
// account identifiers, balances, passwords or recovery data are diagnostics.
export const syncDiagnosticStages = Object.freeze(['worker-start', 'wallet-storage',
  'wallet-recovery', 'rpc-connection', 'artifact-check', 'deployment-check',
  'poi-service', 'wallet-loading', 'provider-loading', 'history-scan',
  'utxo-history', 'txid-history', 'wallet-balance', 'balance-read', 'shutdown']);
const reasons = Object.freeze(['CHECK_FAILED', 'TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR',
  'CANCELLED', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'SDK_ERROR']);

export function syncFailureDiagnostic(stage, reason) {
  return Object.freeze({
    stage: syncDiagnosticStages.includes(stage) ? stage : 'worker-start',
    reason: reasons.includes(reason) ? reason : 'CHECK_FAILED',
  });
}
