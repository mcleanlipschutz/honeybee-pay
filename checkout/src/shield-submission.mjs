import { getAddress } from 'viem';
import { validateShieldReview } from './shield-review.mjs';
import { validateShieldPreflight } from './shield-preflight.mjs';
import { sealShieldIntent } from './shield-attempts.mjs';
import { checkShieldAttempt } from './shield-receipt.mjs';

const HASH = /^0x[0-9a-fA-F]{64}$/;
const hex = value => '0x' + BigInt(value).toString(16);
const address = value => getAddress(value.toLowerCase());
export function requireLiveShieldValidation() {
  throw new Error('Live Sepolia validation is required before deposit signing can be enabled');
}

// Reconcile a persisted public attempt after reload, even when its review expired.
// The caller must recover the journal for the authenticated account, never choose
// a different account's scope from user input. No private review is persisted.
export async function reconcileShieldSubmission({ journal, quoteId, hash, request, assertCurrent }) {
  assertCurrent();
  const attempt = (await journal.list()).find(a => a.intent.quoteId === quoteId);
  if (!attempt) throw new Error('Deposit attempt unavailable');
  const verification = await checkShieldAttempt({ attempt, hash: hash ?? attempt.hash, request });
  assertCurrent();
  if (['reverted', 'approval-confirmed', 'deposit-confirmed'].includes(attempt.status)) return verification;
  await journal.update(quoteId, { status: verification.status, hash: verification.hash, verification });
  return { ...verification, quoteId };
}

// Not connected to the application UI. Production uses the closed gate above.
// Tests inject an explicit gate and a fake wallet; there is no env/runtime switch.
export function createShieldSubmission({ review: source, expected, userId, getConnection, journal, request,
  assertLiveValidation = requireLiveShieldValidation, now = Date.now }) {
  const review = validateShieldReview(source, expected, now());
  let quote = null, busy = false, lastOutcome = null;
  const current = () => {
    const connection = getConnection();
    if (!connection?.ready || !connection.authenticated || connection.userId !== userId
        || address(connection.wallet?.address) !== address(review.publicAddress)) throw new Error('The signed-in account or funding wallet changed');
    return connection;
  };
  const quoted = quoteId => {
    current();
    if (!quote || quote.quoteId !== quoteId || now() >= review.expiresAt) throw new Error('Review the deposit and its fee again');
    return validateShieldPreflight(quote, review, now());
  };
  return Object.freeze({
    setQuote(value) { if (busy) throw new Error('Deposit action already running'); current(); quote = validateShieldPreflight(value, review, now()); return quote; },
    outcome: () => structuredClone(lastOutcome),
    async confirm(quoteId) {
      if (busy) throw new Error('Deposit action already running');
      busy = true;
      let claimed = false, walletRequested = false, walletHash = null;
      try {
        await assertLiveValidation();
        const q = quoted(quoteId), selected = current().wallet;
        const provider = await selected.getEthereumProvider();
        const chain = await provider.request({ method: 'eth_chainId' });
        const accounts = await provider.request({ method: 'eth_accounts' });
        if (BigInt(chain) !== 11155111n || !accounts.some(a => address(a) === address(review.publicAddress))) {
          throw new Error('Switch the selected wallet to Sepolia before confirming');
        }
        const nonce = await provider.request({ method: 'eth_getTransactionCount', params: [review.publicAddress, 'pending'] });
        if (typeof nonce !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(nonce) || BigInt(nonce) >= 2n ** 64n) throw new Error('Wallet nonce is unavailable');
        quoted(quoteId);
        const transaction = { ...q.transaction, type: 2, nonce,
          gasLimit: hex(q.gasLimitUnits), maxFeePerGas: hex(q.maxFeePerGasWei), maxPriorityFeePerGas: hex(q.maxPriorityFeePerGasWei) };
        const intent = sealShieldIntent({ reviewId: review.reviewId, quoteId, stage: q.stage,
          amountUnits: review.amountUnits, receivedUnits: review.receivedUnits, feeUnits: review.feeUnits,
          transaction, createdAt: now() });
        await journal.claim(intent); // Persist BEFORE entering a wallet prompt.
        claimed = true;
        await assertLiveValidation();
        quoted(quoteId);
        const connection = current();
        // Recheck provider state after the asynchronous journal/gate operations.
        if (BigInt(await provider.request({ method: 'eth_chainId' })) !== 11155111n
            || !(await provider.request({ method: 'eth_accounts' })).some(a => address(a) === address(review.publicAddress))
            || BigInt(await provider.request({ method: 'eth_getTransactionCount', params: [review.publicAddress, 'pending'] })) !== BigInt(nonce)) throw new Error('Wallet changed before confirmation');
        quoted(quoteId);
        if (current().wallet !== selected || typeof connection.sendTransaction !== 'function') throw new Error('Wallet changed before confirmation');
        walletRequested = true;
        const result = await connection.sendTransaction(Object.freeze({ ...transaction }), {
          address: review.publicAddress, sponsor: false, uiOptions: { showWalletUIs: true },
        });
        if (!HASH.test(result?.hash)) throw new Error('Wallet did not return a transaction hash');
        // Always retain a late hash, even after logout or quote expiry. Never send again.
        walletHash = result.hash;
        lastOutcome = { status: 'pending', hash: result.hash, quoteId };
        await journal.update(quoteId, { status: 'pending', hash: result.hash });
        return structuredClone(lastOutcome);
      } catch (error) {
        // A blocked new click must not erase a hash whose persistence failed.
        if (!claimed) throw error;
        const status = !walletRequested ? 'not-submitted' : error?.code === 4001 && !walletHash ? 'rejected' : 'unknown';
        lastOutcome = { status, hash: walletHash, quoteId };
        try { await journal.update(quoteId, { status, hash: walletHash }); }
        catch { lastOutcome.storageError = true; }
        return structuredClone(lastOutcome);
      } finally { busy = false; }
    },
    async recheck(quoteId, hash) {
      if (busy) throw new Error('Deposit action already running');
      busy = true;
      try {
        current();
        const attempt = (await journal.list()).find(a => a.intent.quoteId === quoteId);
        if (!attempt || attempt.intent.reviewId !== review.reviewId) throw new Error('Deposit attempt unavailable');
        lastOutcome = await reconcileShieldSubmission({ journal, quoteId, hash, request, assertCurrent: current });
        return structuredClone(lastOutcome);
      } finally { busy = false; }
    },
  });
}
