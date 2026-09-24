import { addRpcUrlOverrideToChain } from '@privy-io/chains';
import { sepolia } from 'viem/chains';
import { toHex } from 'viem';

export const PAYMENT_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
// Privy supplies its own RPC for recognized chains unless explicitly overridden.
// Use the same endpoint for its preparation/broadcast and our balance/receipt reads.
export const paymentChain = addRpcUrlOverrideToChain({
  ...sepolia,
  rpcUrls: { ...sepolia.rpcUrls, default: { http: [PAYMENT_RPC_URL] } },
}, PAYMENT_RPC_URL);

export function toWalletTransaction(transaction, nonce) {
  if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error('Invalid payment nonce.');
  const { gas, ...rest } = transaction;
  // Privy's public request type uses gasLimit. Keep all reviewed fee ceilings.
  // Its converter treats numeric zero as absent, so explicitly encode nonce zero.
  return { ...rest, ...(gas === undefined ? {} : { gasLimit: gas }), nonce: toHex(nonce) };
}
