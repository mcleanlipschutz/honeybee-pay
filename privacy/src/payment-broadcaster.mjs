import { WakuBroadcasterClient, BroadcasterTransaction } from '@railgun-community/waku-broadcaster-client-node';
import { TXIDVersion } from '@railgun-community/shared-models';
import { testNetwork } from './network-preflight.mjs';
import { accountSyncNetwork, accountSyncToken } from './account-sync.mjs';

const chain = testNetwork(accountSyncNetwork).chain;
export async function openPaymentBroadcaster(checkSession, expected) {
  let timer;
  const deadline = Date.now() + 90000;
  const check = () => { checkSession(); if (Date.now() >= deadline) throw new Error('Private payment broadcaster unavailable'); };
  try {
    // The pinned client verifies fee-message signatures and expiry. No developer
    // mode, sender public wallet, unsigned price feed, or arbitrary endpoint.
    await Promise.race([
      WakuBroadcasterClient.start(chain, { enableHealthcheckLogs: false }, () => {}, { log() {}, error() {} }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Private payment broadcaster unavailable')), 90000); }),
    ]);
    clearTimeout(timer);
    for (;;) {
      check();
      const choices = WakuBroadcasterClient.findBroadcastersForToken(chain, accountSyncToken, false) || [];
      const selected = expected ? choices.find(b => b.railgunAddress === expected.railgunAddress
        && b.tokenFee.feesID === expected.tokenFee.feesID
        && b.tokenFee.feePerUnitGas === expected.tokenFee.feePerUnitGas)
        : WakuBroadcasterClient.findBestBroadcaster(chain, accountSyncToken, false);
      if (selected && selected.tokenFee.expiration > Date.now() + 30000) {
        return { selected: structuredClone(selected),
          async create(populated, minGas) {
            checkSession();
            if (Date.now() >= selected.tokenFee.expiration) throw new Error('Broadcaster fee expired');
            return BroadcasterTransaction.create(TXIDVersion.V2_PoseidonMerkle,
              populated.transaction.to, populated.transaction.data, selected.railgunAddress,
              selected.tokenFee.feesID, chain, populated.nullifiers, minGas, false,
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
