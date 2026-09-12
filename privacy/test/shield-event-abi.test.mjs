import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { walletInterface } from '../src/deployment-check.mjs';
import { shieldEventAbi } from '../../checkout/src/shield-receipt.mjs';

test('browser Shield event schema exactly matches the installed Engine ABI', () => {
  const browser = new Interface(shieldEventAbi);
  // Explicit `indexed: false` and omitted false values are ABI-equivalent.
  assert.equal(browser.getEvent('Shield').format('full'), walletInterface.getEvent('Shield').format('full'));
  const args = [0, 1, [{ npk: '0x' + '11'.repeat(32), token: { tokenType: 0,
    tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', tokenSubID: 0 }, value: 997500 }],
  [{ encryptedBundle: Array(3).fill('0x' + '22'.repeat(32)), shieldKey: '0x' + '33'.repeat(32) }], [2500]];
  assert.deepEqual(browser.encodeEventLog('Shield', args), walletInterface.encodeEventLog('Shield', args));
});
