import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, zeroPadValue } from 'ethers';
import { testNetwork } from '../src/network-preflight.mjs';
import { inspectDeployment, expectedContractKey, implementationSlot, pausedSlot,
  walletInterface, relayInterface } from '../src/deployment-check.mjs';

function fixture(change = {}) {
  const config = testNetwork('Ethereum_Sepolia');
  const codes = { proxy: '0x6001', implementation: '0x6002', relay: '0x6003' };
  const pins = { network: config.name, chainID: config.chain.id, contracts: {
    proxy: { address: config.proxyContract, runtimeCodeHash: keccak256(codes.proxy) },
    implementation: { address: '0x1234567890123456789012345678901234567890', runtimeCodeHash: keccak256(codes.implementation) },
    relay: { address: config.relayAdaptContract, runtimeCodeHash: keccak256(codes.relay) },
  } };
  // ABI comparison fixture only, not a valid cryptographic key.
  const vkey = { protocol: 'groth16', curve: 'bn128', nPublic: 5,
    vk_alpha_1: ['1', '2'], vk_beta_2: [['3', '4'], ['5', '6']],
    vk_gamma_2: [['7', '8'], ['9', '10']], vk_delta_2: [['11', '12'], ['13', '14']],
    IC: Array.from({ length: 6 }, (_, i) => [String(i + 20), String(i + 30)]) };
  const contractKey = expectedContractKey(vkey);
  if (change.key) contractKey[4][5][0] += 1n;
  const block = { number: '0x1234', hash: '0x' + 'aa'.repeat(32) };
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === 'eth_chainId') return change.chain ? '0x1' : '0xaa36a7';
    if (method === 'eth_getBlockByNumber') {
      return change.reorg && params[0] !== 'finalized' ? { ...block, hash: '0x' + 'bb'.repeat(32) } : block;
    }
    assert.equal(params.at(-1), block.number, 'All state reads must use the same finalized height');
    if (method === 'eth_getCode') {
      if (change.code) return '0x6009';
      return codes[Object.keys(pins.contracts).find(role => pins.contracts[role].address === params[0])];
    }
    if (method === 'eth_getStorageAt' && params[1] === implementationSlot) {
      return zeroPadValue(change.implementation ? '0x1111111111111111111111111111111111111111' : pins.contracts.implementation.address, 32);
    }
    if (method === 'eth_getStorageAt' && params[1] === pausedSlot) return zeroPadValue(change.paused ? '0x01' : '0x00', 32);
    if (method === 'eth_call' && params[0].to === pins.contracts.relay.address) {
      return relayInterface.encodeFunctionResult('railgun', [change.relay ? pins.contracts.implementation.address : pins.contracts.proxy.address]);
    }
    if (method === 'eth_call' && params[0].to === pins.contracts.proxy.address) {
      assert.deepEqual([...walletInterface.decodeFunctionData('getVerificationKey', params[0].data)], [1n, 2n]);
      return walletInterface.encodeFunctionResult('getVerificationKey', [['fixture-only', ...contractKey]]);
    }
    throw new Error('Unexpected RPC method');
  };
  return { pins, vkey, rpc, calls };
}
test('deployment checks compare every verification-key point and use one finalized block', async () => {
  const { pins, vkey, rpc } = fixture();
  const result = await inspectDeployment('Ethereum_Sepolia', rpc, pins, vkey);
  assert.equal(result.verificationKeyMatches, true);
  assert.equal(result.proxyPaused, false);
  assert.equal(result.paymentReady, false);
});
for (const [change, message] of [
  ['code', /bytecode/], ['implementation', /implementation/], ['paused', /paused/],
  ['relay', /Relay/], ['key', /verification key/], ['reorg', /Block changed/], ['chain', /chain/],
]) {
  test(`deployment check blocks ${change} mismatch`, async () => {
    const { pins, vkey, rpc } = fixture({ [change]: true });
    await assert.rejects(inspectDeployment('Ethereum_Sepolia', rpc, pins, vkey), message);
  });
}
test('unreviewed test networks and production chains cannot use Sepolia pins', async () => {
  const { pins, vkey, rpc, calls } = fixture();
  await assert.rejects(inspectDeployment('Polygon_Amoy', rpc, pins, vkey), /reviewed deployment/);
  await assert.rejects(inspectDeployment('Ethereum', rpc, pins, vkey), /test-network/);
  assert.equal(calls.length, 0);
});

test('latest-head preflight preserves all deployment checks and rejects caller-selected historical heads', async () => {
  const good = fixture();
  const result = await inspectDeployment('Ethereum_Sepolia', good.rpc, good.pins, good.vkey, { blockTag: 'latest' });
  assert.equal(result.head, 'latest');
  assert.equal(good.calls.find(c => c.method === 'eth_getBlockByNumber').params[0], 'latest');
  const changed = fixture({ code: true });
  await assert.rejects(inspectDeployment('Ethereum_Sepolia', changed.rpc, changed.pins, changed.vkey, { blockTag: 'latest' }), /bytecode/);
  await assert.rejects(inspectDeployment('Ethereum_Sepolia', good.rpc, good.pins, good.vkey, { blockTag: '0x1234' }), /Unsupported/);
});
