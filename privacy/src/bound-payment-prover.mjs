import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ProofType } from '@railgun-community/shared-models';
import { RelayAdaptHelper } from '@railgun-community/engine';
import { relayInterface } from './deployment-check.mjs';
import { testNetwork } from './network-preflight.mjs';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('@railgun-community/wallet'));
// Pinned Wallet 10.9.0 internals: its public transfer API cannot attach AdaptID.
// Reuse its proof/POI and gas routines, with no changes to installed packages.
const generator = require(join(root, 'services/transactions/tx-generator.js'));
const estimator = require(join(root, 'services/transactions/tx-gas-broadcaster-fee-estimator.js'));
const serialize = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
const destination = testNetwork('Ethereum_Sepolia').relayAdaptContract;
// Reference broadcasters require requireSuccess=false. There are no external
// calls here: railgun.transact still executes both bound proofs atomically.
const transaction = (txs, random) => ({ to: destination, value: '0x0',
  data: relayInterface.encodeFunctionData('relay', [txs, RelayAdaptHelper.getActionData(random, false, [], 0n)]) });
const reviewedShape = txs => {
  if (txs.length !== 2 || txs.some(tx => tx.nullifiers.length !== 1 || tx.commitments.length !== 2)) {
    throw new Error('This test payment needs one spendable note per token and change in both tokens. Choose a smaller payment or fund separate test deposits.');
  }
};

export function createBoundPaymentProver() {
  let saved;
  return {
    async gasEstimateForUnprovenTransfer(version, network, id, key, memo, recipients, nfts, gas, feeDetails, publicSend) {
      if (network !== 'Ethereum_Sepolia' || publicSend || nfts.length) throw new Error('Unsupported private payment');
      const result = await estimator.gasEstimateResponseDummyProofIterativeBroadcasterFee(
        fee => generator.generateDummyProofTransactions(ProofType.Transfer, network, id, version, key,
          false, memo, recipients, [], fee, false, 0n),
        txs => transaction(txs, randomBytes(31).toString('hex')),
        version, network, id, recipients, gas, feeDetails, false, true);
      // The SDK starts with a zero-fee dummy, then adds the fee and its gas
      // variance. Check the final amount's input shape before saving a quote.
      const fee = estimator.calculateBroadcasterFeeERC20Amount(feeDetails, { ...gas, gasEstimate: result.gasEstimate });
      reviewedShape(await generator.generateDummyProofTransactions(ProofType.Transfer, network, id, version, key,
        false, memo, recipients, [], fee, false, 0n));
      return result;
    },
    async generateTransferProof(version, network, id, key, showSender, memo, recipients, nfts, fee, publicSend, minGas, progress) {
      saved = null;
      if (network !== 'Ethereum_Sepolia' || showSender || publicSend || nfts.length) throw new Error('Unsupported private payment');
      const dummy = await generator.generateDummyProofTransactions(ProofType.Transfer, network, id, version, key,
        false, memo, recipients, [], fee, false, minGas);
      reviewedShape(dummy);
      const random = randomBytes(31).toString('hex');
      const parameters = RelayAdaptHelper.getRelayAdaptParams(dummy, random, false, [], 0n);
      const result = await generator.generateProofTransactions(ProofType.Transfer, network, id, version, key,
        false, memo, recipients, [], fee, false, { contract: destination, parameters }, false, minGas, progress);
      reviewedShape(result.provedTransactions);
      if (RelayAdaptHelper.getRelayAdaptParams(result.provedTransactions, random, false, [], 0n) !== parameters) throw new Error('Private inputs changed while proving');
      saved = { terms: serialize([version, network, id, false, memo, recipients, [], fee, false, minGas]),
        populated: { transaction: transaction(result.provedTransactions, random),
          nullifiers: generator.nullifiersForTransactions(result.provedTransactions),
          preTransactionPOIsPerTxidLeafPerList: result.preTransactionPOIsPerTxidLeafPerList } };
    },
    async populateProvedTransfer(version, network, id, showSender, memo, recipients, nfts, fee, publicSend, minGas) {
      const original = saved; saved = null;
      if (!original || original.terms !== serialize([version, network, id, showSender, memo, recipients, nfts, fee, publicSend, minGas])) throw new Error('Private proof terms changed');
      return original.populated;
    },
  };
}
