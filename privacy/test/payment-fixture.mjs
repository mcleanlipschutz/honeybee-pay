// Deterministic SDK/RPC/broadcaster doubles. These are NOT cryptographic proofs
// or live transfers; actual Groth16 checks live in proof:transfer.
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RailgunEngine } from '@railgun-community/engine';
import { TXIDVersion } from '@railgun-community/shared-models';
import { createAccountInvoice } from '../src/account-invoice.mjs';
import { accountSyncToken } from '../src/account-sync.mjs';
import { walletInterface, relayInterface } from '../src/deployment-check.mjs';
import { paymentProxy, paymentRelay, bindingHash } from '../src/payment-verification.mjs';
import { operatePrivatePayment } from '../src/account-private-payment.mjs';
import { createPaymentStore } from '../src/payment-store.mjs';

import { feeWETH } from '../../shared/test-assets.mjs';

export const word = byte => '0x' + byte.repeat(32), hash = word('aa');
export async function paymentFixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'hb-payment-unit-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateAddress = n => RailgunEngine.encodeAddress({ masterPublicKey: BigInt(n), viewingPublicKey: new Uint8Array(32).fill(n) });
  const wallet = { id: 'test-buyer-only', railgunAddress: privateAddress(1) };
  const request = createAccountInvoice({ wallet: { id: 'test-merchant-only', railgunAddress: privateAddress(2) }, amount: '1', lifetimeSeconds: 3600, checkSession() {} }).paymentRequest;
  const session = { ownerId: '01'.repeat(32), expiresAt: Date.now() + 3600000 };
  const privateKey = '0x' + '02'.repeat(32), checkSession = () => { if (Date.now() >= session.expiresAt) throw Error('Expired session'); };
  const store = createPaymentStore({ directory, privateKey, ownerId: session.ownerId, checkSession });
  const state = { balance: 3000000n, feeBalance: 3000000n, fee: 10000n, sends: 0, proofs: 0, acceptProof: true,
    nullifierSpent: false, scanComplete: true, sendFailure: false, beforeSend: async () => {}, changeProof: () => {} };
  const block = { number: '0x123', hash: word('bb'), timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16), baseFeePerGas: '0x3b9aca00' };
  let utxo, txid, balance;
  const sdk = {
    setOnUTXOMerkletreeScanCallback: fn => { utxo = fn; }, setOnTXIDMerkletreeScanCallback: fn => { txid = fn; },
    setOnBalanceUpdateCallback: fn => { balance = fn; }, loadProvider: async () => {},
    refreshBalances: async chain => {
      utxo({ chain, scanStatus: state.scanComplete ? 'Complete' : 'Incomplete' }); txid({ chain, scanStatus: 'Complete' });
      balance({ railgunWalletID: wallet.id, chain, txidVersion: TXIDVersion.V2_PoseidonMerkle });
    },
    walletForID: () => wallet, balanceForERC20Token: async (_v, _w, _n, _t, onlySpendable) => { if (!onlySpendable) throw Error('Spendability bypass'); return _t.toLowerCase() === feeWETH.token.toLowerCase() ? state.feeBalance : state.balance; },
    gasEstimateForUnprovenTransfer: async () => ({ gasEstimate: 100000n }),
    calculateBroadcasterFeeERC20Amount: () => ({ tokenAddress: feeWETH.token, amount: state.fee }),
    getProver: () => ({ setSnarkJSGroth16() {} }),
    generateTransferProof: async (...args) => { state.proofs++; state.proofArgs = args; },
    populateProvedTransfer: async (...args) => {
      const struct = { proof: { a: { x: 1n, y: 2n }, b: { x: [3n, 4n], y: [5n, 6n] }, c: { x: 7n, y: 8n } },
        merkleRoot: word('11'), nullifiers: [word('22')], commitments: [word('33'), word('44')],
        boundParams: { treeNumber: 0, minGasPrice: args[9], unshield: 0, chainID: 11155111,
          adaptContract: paymentRelay, adaptParams: word('00'),
          commitmentCiphertext: Array.from({ length: 2 }, () => ({ ciphertext: Array(4).fill(word('66')),
            blindedSenderViewingKey: word('77'), blindedReceiverViewingKey: word('88'), annotationData: '0x', memo: '0x' })) },
        unshieldPreimage: { npk: word('00'), token: { tokenType: 0, tokenAddress: '0x' + '00'.repeat(20), tokenSubID: 0 }, value: 0 } };
      const second = structuredClone(struct); second.nullifiers = [word('99')]; second.commitments = [word('aa'), word('bb')];
      second.boundParams.treeNumber = 1;
      const structs = [struct, second], action = { random: '0x' + '01'.repeat(31), requireSuccess: state.legacyRelay === true, minGasLimit: 0n, calls: [] };
      for (const tx of structs) tx.boundParams.adaptParams = bindingHash(structs, action);
      state.changeProof(struct); state.struct = struct; state.structs = structs;
      state.populated = { transaction: { to: paymentRelay, value: 0n, data: relayInterface.encodeFunctionData('relay', [structs, action]) },
        nullifiers: structs.flatMap(tx => tx.nullifiers), preTransactionPOIsPerTxidLeafPerList: { unitTestDouble: true } };
      return state.populated;
    },
    getCompletedTxidFromNullifiers: async () => ({ txid: state.discoveredHash }),
  };
  const selected = { railgunAddress: privateAddress(3), tokenAddress: feeWETH.token,
    tokenFee: { feePerUnitGas: '0x1', feesID: 'unit-test', expiration: Date.now() + 600000, availableWallets: 1 } };
  const rpc = async (method, params) => {
    if (method === 'eth_chainId') return state.wrongChain ? '0x1' : '0xaa36a7';
    if (method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00';
    if (method === 'eth_getBlockByNumber') return params[0] === 'latest' ? { ...block, number: '0x124' } : { ...block, number: params[0], ...(state.reorg ? { hash: word('cc') } : {}) };
    if (method === 'eth_getLogs') return (state.receipt?.logs || []).filter(log => log.topics[0] === params[0].topics[0]
      && BigInt(log.blockNumber) >= BigInt(params[0].fromBlock) && BigInt(log.blockNumber) <= BigInt(params[0].toBlock));
    if (method === 'eth_getTransactionByHash') return state.tx ?? null;
    if (method === 'eth_getTransactionReceipt') return state.receipt ?? null;
    if (method === 'eth_call') {
      const call = walletInterface.parseTransaction({ data: params[0].data });
      const valid = call.name === 'verify' ? state.acceptProof : call.name === 'nullifiers' ? state.nullifierSpent : true;
      return walletInterface.encodeFunctionResult(call.name, [valid]);
    }
    throw Error('Unexpected RPC call');
  };
  const prepared = { rpc, rpcURL: 'http://127.0.0.1:9999', deployment: {}, inspect: async () => ({ blockNumber: block.number, blockHash: block.hash }) };
  const openBroadcaster = async () => ({ selected, close: async () => {}, create: async () => ({ send: async () => {
    state.sends++; await state.beforeSend(); if (state.sendFailure) throw state.sendError || Error('Lost response'); return state.ackHash || hash;
  } }) });
  const run = (action, fields = {}) => operatePrivatePayment({ action, paymentRequest: request, maxFeeUnits: '100000',
    sdk, wallet, key: 'unit-encryption-key', privateKey, directory, session, prepared,
    checkSession, signal: AbortSignal.timeout(10000), openBroadcaster, paymentProver: sdk, ...fields });
  const mined = () => {
    state.nullifierSpent = true;
    const s = state.struct;
    const log = (name, args, index) => ({ address: paymentProxy, ...walletInterface.encodeEventLog(walletInterface.getEvent(name), args),
      blockHash: block.hash, blockNumber: block.number, transactionHash: hash, logIndex: '0x' + index.toString(16), removed: false });
    const from = '0x' + '99'.repeat(20);
    state.tx = { hash, from, to: paymentRelay, input: state.populated.transaction.data, value: '0x0', chainId: '0xaa36a7', blockHash: block.hash, blockNumber: block.number };
    state.receipt = { transactionHash: hash, from, to: paymentRelay, blockHash: block.hash, blockNumber: block.number, status: '0x1',
      logs: [...state.structs.map((tx, i) => log('Nullified', [tx.boundParams.treeNumber, tx.nullifiers], i)), log('Transact', [0, 0, state.structs.flatMap(tx => tx.commitments), state.structs.flatMap(tx => tx.boundParams.commitmentCiphertext)], 2)] };
  };
  return { run, state, store, wallet, request, directory, privateKey, session, selected, sdk, rpc, checkSession, mined };
}
