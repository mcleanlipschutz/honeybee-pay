export function createScanTracker(chain) {
  const state = { utxo: 'Pending', txid: 'Pending' };
  return {
    update(kind, event) {
      if (!Object.hasOwn(state, kind) || event.chain?.type !== chain.type || event.chain?.id !== chain.id) return;
      if (['Started', 'Updated', 'Complete', 'Incomplete'].includes(event.scanStatus)) state[kind] = event.scanStatus;
    },
    snapshot: () => ({ ...state }),
    complete: () => state.utxo === 'Complete' && state.txid === 'Complete',
  };
}
