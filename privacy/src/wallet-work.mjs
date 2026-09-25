// Engine 9.6.0 launches these asynchronous methods without consistently
// awaiting/catching them. Track this account's work so the database remains open
// until it finishes, and any failure rejects the operation instead of becoming
// an unhandled rejection after a superficially successful balance callback.
export function trackWalletWork(wallet) {
  const pending = new Set(), originals = new Map();
  let failure;
  for (const name of ['decryptBalances', 'refreshPOIsForTXIDVersion']) {
    if (typeof wallet[name] !== 'function') throw new Error('Unsupported wallet lifecycle');
    const original = wallet[name]; originals.set(name, original);
    wallet[name] = function (...args) {
      const task = Promise.resolve().then(() => original.apply(this, args))
        .catch(error => { failure ??= error; });
      pending.add(task);
      task.finally(() => pending.delete(task));
      return task;
    };
  }
  return Object.freeze({
    check() { if (failure) throw failure; },
    async drain(checkSession) {
      do {
        checkSession();
        await Promise.all([...pending]);
        // Include work queued by completion callbacks in this event-loop turn.
        await new Promise(resolve => setImmediate(resolve));
      } while (pending.size);
      checkSession();
      if (failure) throw failure;
    },
    restore() {
      if (pending.size) throw new Error('Wallet still has pending work');
      for (const [name, original] of originals) wallet[name] = original;
    },
  });
}
