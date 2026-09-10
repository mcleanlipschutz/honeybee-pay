import { bech32m } from '@scure/base';
import { keccak256, stringToHex } from 'viem';
import { validatePrivateRequest, privateRequestFile, readPrivateRequestFile, privateRequestInvoice } from '../../shared/private-request.mjs';
export { privateRequestAmount, requestLifetimes, requestFileLimit } from '../../shared/private-request.mjs';

export function validatePrivateRecipient(recipient) {
  if (typeof recipient !== 'string' || recipient.length !== 127 || recipient !== recipient.toLowerCase()) throw new Error('Invalid private recipient');
  const decoded = bech32m.decode(recipient, 127), bytes = bech32m.fromWords(decoded.words);
  if (decoded.prefix !== '0zk' || bytes.length !== 73 || bytes[0] !== 1
      || bech32m.encode('0zk', bech32m.toWords(bytes), 127) !== recipient) throw new Error('Invalid private recipient');
  const mask = new TextEncoder().encode('railgun');
  const network = bytes.slice(33, 41).map((value, index) => value ^ (mask[index] ?? 0));
  const chainId = network.slice(1).reduce((id, value) => id * 256n + BigInt(value), 0n);
  if (!network.every(value => value === 255) && (network[0] !== 0 || chainId !== 11155111n)) throw new Error('Invalid private recipient');
}
const dependencies = now => ({ now, validateRecipient: validatePrivateRecipient, hash: text => keccak256(stringToHex(text)) });
export const validatePaymentRequest = (value, now) => validatePrivateRequest(value, dependencies(now));
export const paymentRequestFile = (value, now) => privateRequestFile(value, dependencies(now));
export const readPaymentRequest = (text, now) => readPrivateRequestFile(text, dependencies(now));
export const paymentRequestInvoice = (value, now) => privateRequestInvoice(value, dependencies(now));

// A new import invalidates any earlier file read; account changes invalidate all work.
export function createPaymentRequestReader({ isCurrent }) {
  let generation = 0;
  return { clear() { generation++; }, async read(file) {
    const operation = ++generation;
    const current = () => { if (generation !== operation || !isCurrent()) throw new Error('The request selection or account changed. Open the file again.'); };
    current();
    if (!file || file.size < 1 || file.size > 4096) throw new Error('Choose a Honeybee payment request file smaller than 4 KB.');
    const text = await file.text();
    current();
    return readPaymentRequest(text);
  } };
}
