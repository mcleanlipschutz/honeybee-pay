import { getAddress } from 'viem';
import { createShieldAttemptJournal, shieldAttemptScope, validateShieldAttempt } from './shield-attempts.mjs';
import { reconcileShieldSubmission } from './shield-submission.mjs';
import { shieldProxy, shieldToken } from './shield-review.mjs';

const HASH = /^0x[0-9a-fA-F]{64}$/;
const reads = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByNumber']);
const labels = Object.freeze({ 'awaiting-wallet': 'Wallet outcome not recorded', pending: 'Pending confirmation',
  unknown: 'Outcome unknown', 'not-submitted': 'Not submitted', rejected: 'Declined in wallet', reverted: 'Reverted',
  'approval-confirmed': 'Approval confirmed', 'deposit-confirmed': 'Deposit confirmed' });
const canCheck = status => !['not-submitted', 'rejected'].includes(status);
const address = value => getAddress(value.toLowerCase());
export class DepositActivityError extends Error {}
const problem = message => new DepositActivityError(message);

// Return only presentation fields. Never return raw calldata, decrypted review
// material, provider errors, or unchecked stored verification objects to the UI.
export function depositActivitySummary(record) {
  validateShieldAttempt(record);
  const i = record.intent, tx = i.transaction;
  const units = value => {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,7})$/.test(value)) throw Error();
    return BigInt(value);
  };
  const amount = units(i.amountUnits), received = units(i.receivedUnits), fee = units(i.feeUnits);
  if (amount < 1n || amount > 10000000n || received < 1n || received + fee !== amount
      || !Number.isSafeInteger(i.createdAt) || i.createdAt <= 0 || i.createdAt > 8640000000000000
      || tx.chainId !== 11155111 || tx.type !== 2 || tx.value !== '0x0'
      || address(tx.to) !== address(i.stage === 'approval' ? shieldToken : shieldProxy)) throw Error();
  return Object.freeze({ quoteId: i.quoteId, stage: i.stage, amountUnits: i.amountUnits,
    receivedUnits: i.receivedUnits, feeUnits: i.feeUnits, createdAt: i.createdAt,
    fundingAddress: address(tx.from), hash: record.hash, status: record.status,
    statusLabel: labels[record.status], canCheck: canCheck(record.status) });
}

// This controller exposes only list/recheck. It cannot submit, sign, switch a
// network, delete attempts or open the deposit-signing gate.
export function createDepositActivity({ userId, getConnection, isCurrent = () => true,
  storage, locks, timeoutMs = 30000 }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('Invalid check timeout');
  const journal = createShieldAttemptJournal({ scope: shieldAttemptScope(userId), storage, locks });
  let active = false, closed = false;
  const current = () => {
    const c = getConnection();
    if (closed || !isCurrent() || !c?.ready || !c.authenticated || c.userId !== userId) {
      throw problem('Your account changed. Reopen deposit activity after signing in.');
    }
    return c;
  };
  const run = async action => {
    current();
    if (active) throw problem('A deposit check is already running.');
    active = true;
    let timer, expired = false;
    const check = () => { current(); if (expired) throw problem('The check timed out. Its outcome is still uncertain; check again before another deposit.'); };
    try {
      return await Promise.race([action(check), new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(problem('The check timed out. Its outcome is still uncertain; check again before another deposit.')); }, timeoutMs);
      })]);
    } catch (error) {
      current();
      if (error instanceof DepositActivityError) throw error;
      throw problem('Deposit activity could not be verified. Check the saved record, wallet network and connection. Do not repeat an uncertain deposit.');
    } finally { clearTimeout(timer); active = false; }
  };
  return Object.freeze({
    close() { closed = true; },
    list: () => run(async check => {
      const rows = (await journal.list(check)).map(depositActivitySummary);
      check(); return rows.sort((a, b) => b.createdAt - a.createdAt || a.quoteId.localeCompare(b.quoteId));
    }),
    recheck: (quoteId, candidateHash) => run(async check => {
      const record = (await journal.list(check)).find(a => a.intent.quoteId === quoteId);
      if (!record) throw problem('Choose an existing deposit attempt for this account.');
      const row = depositActivitySummary(record);
      if (!row.canCheck) throw problem('This attempt was recorded as not submitted or declined.');
      const hash = candidateHash === undefined ? row.hash : candidateHash.trim();
      if (!HASH.test(hash)) throw problem('Enter the transaction hash from the original wallet attempt.');
      if (row.hash && row.hash.toLowerCase() !== hash.toLowerCase()) throw problem('This attempt already has a different transaction hash.');
      check();
      const selected = current().wallet;
      if (!selected || address(selected.address) !== row.fundingAddress) throw problem('Reconnect the funding wallet shown on this attempt, then check again.');
      const provider = await selected.getEthereumProvider();
      const sameWallet = () => {
        check();
        const c = current();
        if (c.wallet !== selected || address(c.wallet.address) !== row.fundingAddress) throw problem('Your funding wallet changed. Reopen this attempt.');
      };
      sameWallet();
      const request = async (method, params) => {
        sameWallet();
        if (!reads.has(method)) throw Error('Only receipt reads are available');
        const value = await provider.request({ method, params });
        sameWallet(); return value;
      };
      const verification = await reconcileShieldSubmission({ journal, quoteId, hash, request, assertCurrent: sameWallet });
      sameWallet();
      return { quoteId, status: verification.status, statusLabel: labels[verification.status], hash: verification.hash,
        networkFeeWei: verification.networkFeeWei ?? null, spendableBalanceVerified: false, merchantPayment: false };
    }),
  });
}
