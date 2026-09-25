// Portable wire format. Hashing and address validation come from each runtime.
export const requestNetwork = 'Ethereum_Sepolia';
export const requestToken = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
export const requestLifetimes = Object.freeze([900, 3600, 86400]);
export const requestFileLimit = 4096;
const fields = ['version', 'kind', 'id', 'network', 'chainId', 'token', 'decimals', 'recipient', 'amountUnits', 'createdAt', 'expiresAt'];
const invalid = () => new Error('This payment request is invalid, changed or expired. Ask the merchant for a new Honeybee request file.');

export function privateRequestAmount(amount) {
  if (typeof amount !== 'string' || !/^(0|[1-9][0-9]{0,2})(\.[0-9]{1,6})?$/.test(amount)) throw new Error('Enter an amount up to 10 test USDC with at most six decimal places.');
  const [whole, fraction = ''] = amount.split('.');
  const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (units < 1n || units > 10000000n) throw new Error('Enter an amount greater than zero and no more than 10 test USDC.');
  return units.toString();
}
export function privateRequestBody(value) {
  return Object.fromEntries(fields.map(key => [key, value[key]]));
}
export function validatePrivateRequest(value, { validateRecipient, hash, now = Math.floor(Date.now() / 1000) }) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== fields.length + 1
        || Object.keys(value).some(key => !fields.includes(key) && key !== 'digest')
        || value.version !== 1 || value.kind !== 'honeybee-private-payment-request'
        || typeof value.id !== 'string' || !/^hb_[a-f0-9]{32}$/.test(value.id)
        || value.network !== requestNetwork || value.chainId !== 11155111 || value.token !== requestToken || value.decimals !== 6
        || typeof value.amountUnits !== 'string' || !/^[1-9][0-9]{0,7}$/.test(value.amountUnits)
        || BigInt(value.amountUnits) > 10000000n
        || !Number.isSafeInteger(now) || !Number.isSafeInteger(value.createdAt) || value.createdAt <= 0
        || !Number.isSafeInteger(value.expiresAt) || !requestLifetimes.includes(value.expiresAt - value.createdAt)
        || value.createdAt > now + 5 || value.expiresAt <= now
        || typeof value.digest !== 'string' || !/^0x[a-f0-9]{64}$/.test(value.digest)) throw invalid();
    validateRecipient(value.recipient);
    const body = privateRequestBody(value);
    if (hash(JSON.stringify(body)) !== value.digest) throw invalid();
    return Object.freeze({ ...body, digest: value.digest });
  } catch { throw invalid(); }
}
export function privateRequestFile(value, dependencies) {
  return JSON.stringify(validatePrivateRequest(value, dependencies)) + '\n';
}
export function readPrivateRequestFile(text, dependencies) {
  try {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > requestFileLimit) throw invalid();
    const value = JSON.parse(text);
    // Native compact JSON only: duplicate keys and alternate numeric/escape encodings fail.
    if (JSON.stringify(value) !== text.trim()) throw invalid();
    return validatePrivateRequest(value, dependencies);
  } catch { throw invalid(); }
}
export function privateRequestInvoice(value, dependencies) {
  const request = validatePrivateRequest(value, dependencies);
  return Object.freeze({ id: request.id, network: request.network, recipient: request.recipient,
    token: request.token, amountUnits: BigInt(request.amountUnits), expiresAt: request.expiresAt });
}
