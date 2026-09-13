import { WakuBroadcasterClient, BroadcasterTransaction } from '@railgun-community/waku-broadcaster-client-node';
import { TXIDVersion } from '@railgun-community/shared-models';
import { testNetwork } from './network-preflight.mjs';
import { accountSyncNetwork } from './account-sync.mjs';
import { feeWETH } from '../../shared/test-assets.mjs';

const chain = testNetwork(accountSyncNetwork).chain;

// Only call this with offers returned by the signature-checking SDK search.
// The SDK replaces an instance's cached fee advertisement when its ID rotates.
// A transport offer ID is not payment consent: keep the same fee recipient,
// WETH token and numeric rate, and leave the original quote expiry unchanged.
export function selectQuotedBroadcaster(choices, expected, now = Date.now()) {
  const matching = (choices || []).filter(candidate => {
    try {
      const rate = BigInt(candidate.tokenFee.feePerUnitGas);
      return candidate.railgunAddress === expected.railgunAddress
        && candidate.tokenAddress.toLowerCase() === feeWETH.token.toLowerCase()
        && expected.tokenAddress.toLowerCase() === feeWETH.token.toLowerCase()
        && typeof candidate.tokenFee.feesID === 'string' && candidate.tokenFee.feesID.length > 0
        && rate > 0n && rate <= 10n ** 30n
        && rate === BigInt(expected.tokenFee.feePerUnitGas)
        && Number.isSafeInteger(candidate.tokenFee.expiration)
        && candidate.tokenFee.expiration > now + 30000;
    } catch { return false; }
  });
  return matching.sort((a, b) => b.tokenFee.expiration - a.tokenFee.expiration)[0];
}

export async function openPaymentBroadcaster(checkSession, expected, onDiagnostic) {
  expected = expected && structuredClone(expected);
  let timer;
  // Used only by the public preflight CLI. Diagnostic observers cannot change
  // selection, authorization, network options or the result of this operation.
  const report = (kind, value) => {
    try { onDiagnostic?.(kind, value); } catch { /* Diagnostics are best effort. */ }
  };
  const deadline = Date.now() + 90000;
  const check = () => { checkSession(); if (Date.now() >= deadline) throw new Error('Private payment broadcaster unavailable'); };
  try {
    // The pinned client verifies fee-message signatures and expiry. No developer
    // mode, sender public wallet, unsigned price feed, or arbitrary endpoint.
    await Promise.race([
      WakuBroadcasterClient.start(chain, { enableHealthcheckLogs: false },
        (_, status) => report('status', status),
        { log: value => report('log', value), error: error => report('error', error) }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Private payment broadcaster unavailable')), 90000); }),
    ]);
    clearTimeout(timer);
    for (;;) {
      check();
      const choices = WakuBroadcasterClient.findBroadcastersForToken(chain, feeWETH.token, true) || [];
      const selected = expected ? selectQuotedBroadcaster(choices, expected)
        : WakuBroadcasterClient.findBestBroadcaster(chain, feeWETH.token, true);
      if (selected && selected.tokenFee.expiration > Date.now() + 30000) {
        const agreed = structuredClone(selected);
        return { selected: structuredClone(selected),
          async create(populated, minGas) {
            checkSession();
            // Proving may span another advertisement update. Renew only its
            // transport ID using a fresh signed offer with identical terms.
            const current = selectQuotedBroadcaster(
              WakuBroadcasterClient.findBroadcastersForToken(chain, feeWETH.token, true), agreed);
            if (!current) throw new Error('Quoted broadcaster fee unavailable');
            return BroadcasterTransaction.create(TXIDVersion.V2_PoseidonMerkle,
              populated.transaction.to, populated.transaction.data, agreed.railgunAddress,
              current.tokenFee.feesID, chain, populated.nullifiers, minGas, true,
              populated.preTransactionPOIsPerTxidLeafPerList);
          },
          close: () => WakuBroadcasterClient.stop(),
        };
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    clearTimeout(timer); void WakuBroadcasterClient.stop().catch(() => {}); throw error;
  }
}
