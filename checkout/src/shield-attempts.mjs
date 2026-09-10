import { keccak256, stringToHex } from 'viem';

const HASH = /^0x[0-9a-fA-F]{64}$/;
const unsettled = new Set(['awaiting-wallet', 'pending', 'unknown']);
const states = new Set([...unsettled, 'not-submitted', 'rejected', 'reverted', 'approval-confirmed', 'deposit-confirmed']);
const digest = value => keccak256(stringToHex(JSON.stringify(value)));

// The scope is a local account correlation key, not an authentication credential.
export function shieldAttemptScope(userId) {
  if (typeof userId !== 'string' || !userId) throw new Error('Account required');
  return digest(['honeybee-shield-attempts-v1', userId]);
}

export function sealShieldIntent(intent) {
  const copy = structuredClone(intent);
  return { ...copy, intentId: digest(copy) };
}

export function validateShieldAttempt(record) {
  const { intentId, ...intent } = record.intent;
  if (Object.keys(intent).sort().join(',') !== 'amountUnits,createdAt,feeUnits,quoteId,receivedUnits,reviewId,stage,transaction'
      || Object.keys(intent.transaction).sort().join(',') !== 'chainId,data,from,gasLimit,maxFeePerGas,maxPriorityFeePerGas,nonce,to,type,value'
      || Object.keys(record).some(key => !['intent', 'hash', 'status', 'verification'].includes(key))
      || intentId !== digest(intent) || !HASH.test(intent.reviewId) || !HASH.test(intent.quoteId)
      || !['approval', 'shield'].includes(intent.stage) || !states.has(record.status)
      || (record.hash !== null && !HASH.test(record.hash))
      || (['pending', 'reverted', 'approval-confirmed', 'deposit-confirmed'].includes(record.status) && !record.hash)
      || (record.status === 'approval-confirmed' && intent.stage !== 'approval')
      || (record.status === 'deposit-confirmed' && intent.stage !== 'shield')) throw new Error('Deposit record is invalid');
  return record;
}

// Durable only within this browser profile and origin. Web Locks serialize tabs;
// losing/clearing storage is NOT evidence that an earlier deposit did not happen.
export function createShieldAttemptJournal({ scope, storage = globalThis.localStorage, locks = globalThis.navigator?.locks }) {
  if (!HASH.test(scope) || !storage?.getItem || !storage?.setItem || !locks?.request) {
    throw new Error('Persistent deposit tracking is unavailable');
  }
  const key = `honeybee.shield-attempts.v1.${scope}`;
  const transact = operation => locks.request(key, { mode: 'exclusive' }, () => {
    const text = storage.getItem(key);
    if (text !== null && text.length > 1_000_000) throw new Error('Deposit history is too large');
    const data = text === null ? { version: 1, attempts: [] } : JSON.parse(text);
    if (data.version !== 1 || !Array.isArray(data.attempts) || data.attempts.length > 128) throw new Error('Deposit history is invalid');
    data.attempts.forEach(validateShieldAttempt);
    if (new Set(data.attempts.map(a => a.intent.quoteId)).size !== data.attempts.length) throw new Error('Duplicate deposit records');
    const result = operation(data.attempts);
    storage.setItem(key, JSON.stringify(data)); // Failure stops the caller before signing.
    return structuredClone(result);
  });
  return Object.freeze({
    list: () => transact(attempts => attempts),
    claim: intent => transact(attempts => {
      const record = validateShieldAttempt({ intent, hash: null, status: 'awaiting-wallet' });
      if (attempts.length >= 128) throw new Error('Deposit history is full; reconcile it before continuing');
      if (attempts.some(a => unsettled.has(a.status))) throw new Error('Check the unfinished transaction before another deposit');
      if (attempts.some(a => a.intent.quoteId === intent.quoteId
          || (a.intent.reviewId === intent.reviewId && a.intent.stage === intent.stage
            && !['not-submitted', 'rejected'].includes(a.status)))) throw new Error('This deposit step was already attempted');
      attempts.push(structuredClone(record));
      return record;
    }),
    update: (quoteId, patch) => transact(attempts => {
      const record = attempts.find(a => a.intent.quoteId === quoteId);
      if (!record || !unsettled.has(record.status) || !states.has(patch.status)
          || patch.status === 'awaiting-wallet'
          || (record.status !== 'awaiting-wallet' && ['not-submitted', 'rejected'].includes(patch.status))
          || Object.keys(patch).some(k => !['status', 'hash', 'verification'].includes(k))
          || (record.hash && patch.hash && record.hash.toLowerCase() !== patch.hash.toLowerCase())) {
        throw new Error('Deposit record cannot be replaced');
      }
      Object.assign(record, structuredClone(patch));
      validateShieldAttempt(record);
      return record;
    }),
  });
}
