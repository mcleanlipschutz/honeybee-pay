import { getAddress, isAddress, formatUnits, parseUnits } from 'viem';
import { CHAIN_ID, USDC } from './payment.mjs';

export const APP_ORIGIN = 'https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_TEXT = 4096;
const fields = ['v', 'id', 'chainId', 'token', 'recipient', 'amount', 'expiresAt'];
export class RequestError extends Error {}
const fail = message => { throw new RequestError(message); };
export function recipientAddress(value) {
  if (typeof value !== 'string' || !ADDRESS.test(value) || !isAddress(value, { strict: true }) || /^0x0{40}$/i.test(value)) fail('Enter a valid wallet address.');
  return getAddress(value);
}
export function paymentAmount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) fail('Enter an amount with up to six decimal places.');
  const units = parseUnits(value, 6);
  if (units <= 0n || units > 10_000_000n) fail('Choose an amount above 0 and up to 10 test USDC.');
  return formatUnits(units, 6);
}
export function validateRequest(data, now = Date.now()) {
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).some(key => !fields.includes(key))) fail('This payment request is not supported.');
  if (data.v !== 1 || typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.id)) fail('This payment request is not supported.');
  if (data.chainId !== CHAIN_ID || data.token?.toLowerCase() !== USDC.toLowerCase()) fail('Use a Honeybee request for Sepolia test USDC.');
  if (!Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + 7 * 86400000) fail('This request has expired. Ask for a new one.');
  return Object.freeze({ v: 1, id: data.id, chainId: CHAIN_ID, token: USDC,
    recipient: recipientAddress(data.recipient), amount: data.amount === '' ? '' : paymentAmount(data.amount), expiresAt: data.expiresAt });
}
export function makeRequest({ recipient, amount = '' }, now = Date.now()) {
  return validateRequest({ v: 1, id: crypto.randomUUID(), chainId: CHAIN_ID, token: USDC,
    recipient, amount, expiresAt: now + 86400000 }, now);
}
export function requestLink(request, now = Date.now()) {
  const text = JSON.stringify(validateRequest(request, now));
  const encoded = btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  // Fragment contents stay out of HTTP request paths and server access logs.
  return `${APP_ORIGIN}/#pay=${encoded}`;
}
export function parsePaymentInput(raw, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > MAX_TEXT) fail('Paste a wallet address or Honeybee payment link.');
  const text = raw.trim();
  if (ADDRESS.test(text)) return { recipient: recipientAddress(text), amount: '', request: null };
  if (text.startsWith('ethereum:')) {
    const match = /^ethereum:(0x[0-9a-fA-F]{40})@([0-9]+)(?:\/transfer\?(.+))?$/.exec(text);
    if (!match || match[2] !== String(CHAIN_ID)) fail('This QR code uses a different network or payment type.');
    if (!match[3]) return { recipient: recipientAddress(match[1]), amount: '', request: null };
    if (match[1].toLowerCase() !== USDC.toLowerCase()) fail('This QR code requests an unsupported asset.');
    const params = new URLSearchParams(match[3]);
    if ([...params.keys()].some(key => !['address', 'uint256'].includes(key)) || params.getAll('address').length !== 1 || params.getAll('uint256').length !== 1 || !/^[1-9]\d{0,7}$/.test(params.get('uint256') || '')) fail('This payment QR code is not supported.');
    return { recipient: recipientAddress(params.get('address')), amount: paymentAmount(formatUnits(BigInt(params.get('uint256')), 6)), request: null };
  }
  let url;
  try { url = new URL(text); } catch { fail('Paste a wallet address or Honeybee payment link.'); }
  if (url.origin !== APP_ORIGIN || url.pathname !== '/' || url.search || url.username || url.password || !/^#pay=[A-Za-z0-9_-]+$/.test(url.hash)) fail('This is not a supported Honeybee payment link.');
  let data;
  try { data = JSON.parse(atob(url.hash.slice(5).replaceAll('-', '+').replaceAll('_', '/'))); }
  catch { fail('This payment request could not be read.'); }
  const request = validateRequest(data, now);
  return { recipient: request.recipient, amount: request.amount, request };
}
