import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { TXIDVersion, ProofType, getEVMGasTypeForTransaction } from '@railgun-community/shared-models';
import { createBoundPaymentProver } from '../src/bound-payment-prover.mjs';
import { decodePrivatePaymentBatch, bindingHash, paymentRelay } from '../src/payment-verification.mjs';
import { relayInterface } from '../src/deployment-check.mjs';
import { feeWETH } from '../../shared/test-assets.mjs';
import { paymentFixture, word } from './payment-fixture.mjs';

const require = createRequire(import.meta.url), root = dirname(require.resolve('@railgun-community/wallet'));
const sdkModule = path => require(join(root, path));
const generator = sdkModule('services/transactions/tx-generator.js');
const wallets = sdkModule('services/railgun/wallets/wallets.js');
const balances = sdkModule('services/railgun/wallets/balance-update.js');
const gas = sdkModule('services/transactions/tx-gas-details.js');
// The actual pinned SDK iterative estimator is exercised. Proof generators,
// wallet notes and RPC gas are explicit doubles; real Groth16 is checked by
// proof:bound-transfer. This test neither proves POI nor sends a payment.
test('adapter drives the pinned iterative estimator, binds real-proof call arguments and retains POI for one exact population', async t => {
  const f = await paymentFixture(t), q = (await f.run('payment-quote')).privatePayment.quote;
  await f.run('payment-submit', { quoteId: q.quoteId });
  let shape = 'supported', changeNullifier = false;
  const dummyCalls = [], provedCalls = [], gasCalls = [];
  const cloneBatch = fee => {
    const batch = structuredClone(f.state.structs);
    for (const tx of batch) tx.txidVersion = TXIDVersion.V2_PoseidonMerkle;
    if (fee.amount === 0n) { batch[0].nullifiers = [word('00')]; batch[0].commitments.pop(); batch[0].boundParams.commitmentCiphertext.pop(); }
    if (shape === 'exact-balance') { batch[1].commitments.pop(); batch[1].boundParams.commitmentCiphertext.pop(); }
    if (shape === 'fragmented') batch[1].nullifiers.push(word('ab'));
    return batch;
  };
  t.mock.method(wallets, 'walletForID', () => ({ id: f.wallet.id }));
  t.mock.method(balances, 'balanceForERC20Token', async () => 10n ** 18n);
  t.mock.method(generator, 'generateDummyProofTransactions', async (...args) => {
    dummyCalls.push(args); assert.equal(args[0], ProofType.Transfer); assert.equal(args[5], false);
    assert.equal(args[10], false); assert.equal(args[9].tokenAddress, feeWETH.token);
    return cloneBatch(args[9]);
  });
  t.mock.method(gas, 'getGasEstimate', async (version, network, transaction, from, publicSend, crossContract) => {
    gasCalls.push(transaction);
    assert.equal(version, TXIDVersion.V2_PoseidonMerkle); assert.equal(network, 'Ethereum_Sepolia');
    assert.equal(from, generator.DUMMY_FROM_ADDRESS); assert.equal(publicSend, false); assert.equal(crossContract, true);
    assert.equal(transaction.to, paymentRelay);
    const [batch, action] = relayInterface.decodeFunctionData('relay', transaction.data);
    assert.equal(action.calls.length, 0); assert.equal(action.requireSuccess, false);
    return batch[0].commitments.length === 1 ? 200000n : 300000n;
  });
  const pois = { syntheticProofsPerList: { feeAndMerchant: true } };
  t.mock.method(generator, 'generateProofTransactions', async (...args) => {
    provedCalls.push(args);
    assert.equal(args[0], ProofType.Transfer); assert.equal(args[10], false); assert.equal(args[12], false);
    assert.equal(args[11].contract, paymentRelay);
    const txs = cloneBatch(args[9]);
    for (const tx of txs) { tx.boundParams.adaptParams = args[11].parameters; tx.boundParams.minGasPrice = args[13]; }
    if (changeNullifier) txs[1].nullifiers = [word('cd')];
    args[14](100);
    return { provedTransactions: txs, preTransactionPOIsPerTxidLeafPerList: pois };
  });
  const prover = createBoundPaymentProver(), version = TXIDVersion.V2_PoseidonMerkle, network = 'Ethereum_Sepolia';
  const recipients = [{ tokenAddress: f.request.token, recipientAddress: f.request.recipient, amount: 1000000n }];
  const feeDetails = { tokenAddress: feeWETH.token, feePerUnitGas: 10n ** 18n };
  const estimate = () => prover.gasEstimateForUnprovenTransfer(version, network, f.wallet.id, 'key', 'memo', recipients, [],
    { evmGasType: getEVMGasTypeForTransaction(network, false), gasEstimate: 0n, gasPrice: 1000000000n }, feeDetails, false);
  const result = await estimate();
  assert.ok(result.gasEstimate >= 300000n); assert.equal(dummyCalls[0][9].amount, 0n);
  assert.ok(dummyCalls.at(-1)[9].amount > 0n); assert.equal(gasCalls.length, 2);
  assert.equal(provedCalls.length, 0);
  const fee = { tokenAddress: feeWETH.token, amount: 10000n, recipientAddress: f.selected.railgunAddress };
  const prove = () => prover.generateTransferProof(version, network, f.wallet.id, 'key', false, 'memo', recipients, [], fee, false, 3n, () => {});
  const populate = (memo = 'memo') => prover.populateProvedTransfer(version, network, f.wallet.id, false, memo, recipients, [], fee, false, 3n);
  await prove();
  const populated = await populate();
  assert.deepEqual(populated.preTransactionPOIsPerTxidLeafPerList, pois);
  const batch = decodePrivatePaymentBatch(populated.transaction, populated.nullifiers, 3n);
  const [, action] = relayInterface.decodeFunctionData('relay', populated.transaction.data);
  assert.equal(batch[0].boundParams.adaptParams, bindingHash(batch, action));
  await assert.rejects(populate(), /terms changed/);
  await prove(); await assert.rejects(populate('edited memo'), /terms changed/);
  changeNullifier = true; await assert.rejects(prove(), /inputs changed/); changeNullifier = false;
  for (shape of ['exact-balance', 'fragmented']) {
    await assert.rejects(estimate(), /one spendable note per token/);
    await assert.rejects(prove(), /one spendable note per token/);
  }
});
