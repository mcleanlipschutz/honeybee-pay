// Sepolia only. Fee assets never replace the merchant's Circle test-USDC token.
export const testUSDC = Object.freeze({ id: 'usdc', token: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, label: 'test USDC', maxDepositUnits: '10000000' });
export const feeWETH = Object.freeze({ id: 'fee-weth', token: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', decimals: 18, label: 'Sepolia WETH', maxDepositUnits: '10000000000000000', maxFeeUnits: '10000000000000000',
  runtimeCodeHash: '0xc864e10689f2da18833652a3b075d43106e87f0f90d95ee64f6f0b33bc026083' });
export function testAsset(id = 'usdc') {
  if (id === testUSDC.id) return testUSDC;
  if (id === feeWETH.id) return feeWETH;
  throw new Error('Unsupported Sepolia test asset');
}
export function assetForToken(token) {
  if (typeof token !== 'string') throw new Error('Test token is missing');
  const asset = [testUSDC, feeWETH].find(a => a.token.toLowerCase() === token.toLowerCase());
  if (!asset) throw new Error('Unsupported Sepolia test token');
  return asset;
}
export function testAmountUnits(amount, assetId = 'usdc') {
  const asset = testAsset(assetId);
  if (typeof amount !== 'string' || amount.length > 32
      || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(amount)) throw new Error('Enter a valid test amount');
  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > asset.decimals) throw new Error('Too many decimal places');
  const units = BigInt(whole) * 10n ** BigInt(asset.decimals) + BigInt(fraction.padEnd(asset.decimals, '0'));
  if (units <= 0n || units > BigInt(asset.maxDepositUnits)) throw new Error(asset.id === 'usdc'
    ? 'Test deposits are limited to 10 test USDC' : 'Fee deposits are limited to 0.01 Sepolia WETH');
  return units;
}
