import { randomBytes } from 'node:crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
import { RailgunEngine } from '@railgun-community/engine';
import { privateRequestAmount, privateRequestBody, validatePrivateRequest, requestLifetimes,
  requestNetwork, requestToken } from '../../shared/private-request.mjs';

export function invoiceInput(amount, lifetimeSeconds) {
  const amountUnits = privateRequestAmount(amount);
  if (!requestLifetimes.includes(lifetimeSeconds)) throw new Error('Choose a supported request expiry.');
  return amountUnits;
}
export function validatePrivateRecipient(recipient) {
  if (typeof recipient !== 'string' || recipient.length !== 127 || recipient !== recipient.toLowerCase()) throw new Error('Invalid private recipient');
  const decoded = RailgunEngine.decodeAddress(recipient);
  if (decoded.version !== 1 || (decoded.chain && (decoded.chain.type !== 0 || decoded.chain.id !== 11155111))
      || RailgunEngine.encodeAddress(decoded) !== recipient) throw new Error('Invalid private recipient');
}
export const invoiceValidation = (now = Math.floor(Date.now() / 1000)) => ({
  now, validateRecipient: validatePrivateRecipient, hash: text => keccak256(toUtf8Bytes(text)),
});
export function createAccountInvoice({ wallet, amount, lifetimeSeconds, checkSession, now = Math.floor(Date.now() / 1000) }) {
  checkSession();
  if (!wallet?.id) throw new Error('An account wallet is required');
  const amountUnits = invoiceInput(amount, lifetimeSeconds);
  const body = privateRequestBody({ version: 1, kind: 'honeybee-private-payment-request',
    id: `hb_${randomBytes(16).toString('hex')}`, network: requestNetwork, chainId: 11155111,
    token: requestToken, decimals: 6, recipient: wallet.railgunAddress, amountUnits,
    createdAt: now, expiresAt: now + lifetimeSeconds });
  const dependencies = invoiceValidation(now);
  const paymentRequest = validatePrivateRequest({ ...body, digest: dependencies.hash(JSON.stringify(body)) }, dependencies);
  checkSession();
  return { paymentRequest };
}
