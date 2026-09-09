import assert from 'node:assert/strict';
import { Interface, getAddress, id, toBeHex, keccak256 } from 'ethers';
import { ABIRailgunSmartWallet, ABIRelayAdapt } from '@railgun-community/engine';
import { testNetwork } from './network-preflight.mjs';

export const walletInterface = new Interface(ABIRailgunSmartWallet);
export const relayInterface = new Interface(ABIRelayAdapt);
export const implementationSlot = toBeHex(BigInt(id('eip1967.proxy.implementation')) - 1n, 32);
export const pausedSlot = toBeHex(BigInt(id('eip1967.proxy.paused')) - 1n, 32);
const word = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

export function expectedContractKey(vkey) {
  if (vkey.protocol !== 'groth16' || vkey.curve !== 'bn128'
      || vkey.nPublic !== 5 || vkey.IC.length !== 6) throw new Error('Expected a 01x02 Groth16 verification key');
  const g1 = p => [BigInt(p[0]), BigInt(p[1])];
  // Solidity's pairing precompile uses the opposite Fq2 coordinate order.
  const g2 = p => [[BigInt(p[0][1]), BigInt(p[0][0])], [BigInt(p[1][1]), BigInt(p[1][0])]];
  return [g1(vkey.vk_alpha_1), g2(vkey.vk_beta_2), g2(vkey.vk_gamma_2),
    g2(vkey.vk_delta_2), vkey.IC.map(g1)];
}

export async function inspectDeployment(network, rpc, pins, vkey) {
  const config = testNetwork(network);
  if (pins.network !== network || pins.chainID !== config.chain.id) throw new Error('No reviewed deployment for network');
  const contracts = pins.contracts;
  if (getAddress(contracts.proxy.address) !== getAddress(config.proxyContract)
      || getAddress(contracts.relay.address) !== getAddress(config.relayAdaptContract)) {
    throw new Error('Reviewed addresses do not match SDK configuration');
  }
  const chainID = await rpc('eth_chainId', []);
  if (typeof chainID !== 'string' || !/^0x[0-9a-fA-F]+$/.test(chainID)
      || BigInt(chainID) !== BigInt(config.chain.id)) throw new Error('RPC chain does not match configuration');
  const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
  if (!block || !/^0x[0-9a-fA-F]+$/.test(block.number) || !word(block.hash)) {
    throw new Error('Finalized block unavailable');
  }
  const blockTag = block.number;
  for (const contract of Object.values(contracts)) {
    const code = await rpc('eth_getCode', [contract.address, blockTag]);
    if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)
        || keccak256(code) !== contract.runtimeCodeHash) throw new Error('Runtime bytecode differs from reviewed source record');
  }
  const implementation = await rpc('eth_getStorageAt', [contracts.proxy.address, implementationSlot, blockTag]);
  if (!word(implementation) || !/^0x0{24}/.test(implementation)
      || getAddress('0x' + implementation.slice(-40)) !== getAddress(contracts.implementation.address)) {
    throw new Error('Proxy implementation differs from reviewed deployment');
  }
  const paused = await rpc('eth_getStorageAt', [contracts.proxy.address, pausedSlot, blockTag]);
  if (!word(paused) || BigInt(paused) !== 0n) throw new Error('Proxy is paused or pause state is invalid');
  const relayResult = await rpc('eth_call', [{ to: contracts.relay.address,
    data: relayInterface.encodeFunctionData('railgun') }, blockTag]);
  const [target] = relayInterface.decodeFunctionResult('railgun', relayResult);
  if (getAddress(target) !== getAddress(contracts.proxy.address)) throw new Error('Relay targets a different wallet contract');
  const encodedKey = await rpc('eth_call', [{ to: contracts.proxy.address,
    data: walletInterface.encodeFunctionData('getVerificationKey', [1, 2]) }, blockTag]);
  const [actualKey] = walletInterface.decodeFunctionResult('getVerificationKey', encodedKey);
  const key = actualKey.toArray(true);
  assert.deepEqual(key.slice(1), expectedContractKey(vkey), 'Onchain verification key does not match pinned circuit');
  const finalBlock = await rpc('eth_getBlockByNumber', [blockTag, false]);
  if (!finalBlock || finalBlock.hash !== block.hash) throw new Error('Block changed during deployment inspection');
  return { status: 'reviewed-deployment-and-circuit-matched', network, chainID: config.chain.id,
    blockNumber: block.number, blockHash: block.hash, proxy: contracts.proxy.address,
    implementation: contracts.implementation.address, relay: contracts.relay.address,
    runtimeCodeHashes: Object.fromEntries(Object.entries(contracts).map(([role, c]) => [role, c.runtimeCodeHash])),
    proxyPaused: false, relayTargetMatches: true, circuit: '01x02', verificationKeyMatches: true,
    artifactsIPFSHash: key[0], paymentReady: false,
    note: 'Matches reviewed Sourcify runtime records and circuit at this block; not an audit, synchronization check, or payment settlement.' };
}
