import { TXIDVersion, RailgunWalletBalanceBucket } from '@railgun-community/shared-models';
import { testNetwork } from './network-preflight.mjs';
import { walletInterface, relayInterface } from './deployment-check.mjs';
import { paymentMemo } from './account-private-payment.mjs';
import { paymentRelay, paymentHash, decodePrivatePaymentBatch, verifyPrivatePaymentReceipt } from './payment-verification.mjs';

// SDK-decrypted, account-local receiving notes are matched with an existing
// merchant request AND canonical protocol transaction events. A public USDC
// transfer, shield deposit, memo alone, or broadcaster acknowledgement cannot pass.
export async function checkMerchantReceipts({ sdk, wallet, requests, rpc, checkSession }) {
  const history = await sdk.getWalletTransactionHistory(testNetwork('Ethereum_Sepolia').chain, wallet.id, undefined);
  checkSession();
  if (!Array.isArray(history) || history.length > 5000) throw new Error('Private history exceeds this test review limit');
  const results = [];
  for (const request of requests) {
    if (request.recipient !== wallet.railgunAddress) throw new Error('Merchant request belongs to another wallet');
    const matches = history.filter(item => item.txidVersion === TXIDVersion.V2_PoseidonMerkle
      && item.receiveERC20Amounts.filter(received => received.tokenAddress.toLowerCase() === request.token.toLowerCase()
        && received.amount === BigInt(request.amountUnits) && received.memoText === paymentMemo(request)
        && !received.shieldFee && received.hasValidPOIForActiveLists === true
        && [RailgunWalletBalanceBucket.Spendable, RailgunWalletBalanceBucket.Spent].includes(received.balanceBucket)).length === 1);
    for (const item of matches) {
      checkSession(); const hash = paymentHash(item.txid);
      const tx = await rpc('eth_getTransactionByHash', [hash]);
      if (!tx?.input) continue;
      let record;
      try {
        const isRelay = tx.to?.toLowerCase() === paymentRelay.toLowerCase();
        const decoded = (isRelay ? relayInterface : walletInterface).decodeFunctionData(isRelay ? 'relay' : 'transact', tx.input)[0];
        if (![1, 2].includes(decoded.length)) continue;
        record = { quote: { request, minGasPriceWei: decoded[0].boundParams.minGasPrice.toString() }, hash,
          populated: { transaction: { to: tx.to, data: tx.input, value: tx.value }, nullifiers: decoded.flatMap(tx => tx.nullifiers.map(paymentHash)) } };
        decodePrivatePaymentBatch(record.populated.transaction, record.populated.nullifiers, record.quote.minGasPriceWei);
      } catch { continue; /* Another client's unsupported transfer cannot hide valid Honeybee receipts. */ }
      const receipt = await verifyPrivatePaymentReceipt({ record, hash, rpc, checkSession });
      if (receipt.status === 'confirmed') results.push({ requestId: request.id, requestDigest: request.digest,
        amountUnits: request.amountUnits, recipient: request.recipient, token: request.token,
        memoMatched: true, privateNoteDecrypted: true, poiValidated: true, receipt });
    }
  }
  checkSession();
  if (results.length > 128 || new Set(results.map(r => `${r.requestId}:${r.receipt.hash}`)).size !== results.length) throw new Error('Private receiving history is ambiguous');
  return { receivedPrivatePayments: results, receivedPaymentsCheckedAt: Date.now() };
}
