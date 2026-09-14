import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dedupeSupportedChains, getRpcEndpointFromChain } from '@privy-io/chains';
import { paymentChain, PAYMENT_RPC_URL, toWalletTransaction } from '../src/wallet-network.mjs';
import { approvePayment, buildTransfer, CHAIN_ID, USDC } from '../src/payment.mjs';

// Exercise the converter shipped with our pinned wallet SDK, not an app-only mock.
const walletRequire = createRequire(import.meta.resolve('@privy-io/react-auth'));
const { toViemTransactionSerializable } = await import(walletRequire.resolve('@privy-io/ethereum'));

test('Privy chain normalization keeps signing on the same RPC as balance and receipt reads', () => {
  const [normalized] = dedupeSupportedChains([paymentChain]);
  assert.equal(normalized.id, CHAIN_ID);
  assert.equal(getRpcEndpointFromChain(normalized, 'test-app-id'), PAYMENT_RPC_URL);
  assert.equal(paymentChain.rpcUrls.default.http[0], PAYMENT_RPC_URL);
});

test('installed wallet converter preserves the exact transfer, fee caps and zero/nonzero nonce', () => {
  const sender = '0x1111111111111111111111111111111111111111';
  const approved = approvePayment({ sender, recipient: '0x2222222222222222222222222222222222222222', amount: '1' });
  const transaction = { ...buildTransfer(approved, approved, sender), gas: 60_000n, maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1n };
  for (const nonce of [0, 7]) {
    const request = toWalletTransaction(transaction, nonce);
    const converted = toViemTransactionSerializable(request);
    assert.equal(request.gas, undefined);
    assert.equal(request.gasLimit, transaction.gas);
    assert.equal(converted.nonce, nonce);
    assert.equal(converted.chainId, CHAIN_ID);
    assert.equal(converted.to, USDC);
    assert.equal(converted.data, transaction.data);
    assert.equal(converted.value, 0n);
    assert.equal(converted.gas, transaction.gas);
    assert.equal(converted.maxFeePerGas, transaction.maxFeePerGas);
    assert.equal(converted.maxPriorityFeePerGas, transaction.maxPriorityFeePerGas);
  }
  for (const nonce of [-1, 0.5, undefined]) assert.throws(() => toWalletTransaction(transaction, nonce));
});
