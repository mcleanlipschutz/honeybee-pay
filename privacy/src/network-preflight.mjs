import { NETWORK_CONFIG } from '@railgun-community/shared-models';

// Read-only checks. A configuration entry is not proof of a usable deployment.
export function testNetwork(name) {
  const config = Object.hasOwn(NETWORK_CONFIG, name) ? NETWORK_CONFIG[name] : undefined;
  if (!config) throw new Error('Network is not in this SDK configuration');
  if (!config.isTestnet || config.deprecated) throw new Error('An active test-network configuration is required');
  for (const address of [config.proxyContract, config.relayAdaptContract]) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) {
      throw new Error('Missing protocol contract address');
    }
  }
  return config;
}

export async function inspectNetwork(name, rpc) {
  const config = testNetwork(name);
  const chainID = await rpc('eth_chainId', []);
  if (typeof chainID !== 'string' || !/^0x[0-9a-fA-F]+$/.test(chainID)
      || BigInt(chainID) !== BigInt(config.chain.id)) throw new Error('RPC chain does not match configuration');
  for (const address of [config.proxyContract, config.relayAdaptContract]) {
    const code = await rpc('eth_getCode', [address, 'latest']);
    if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || /^0x0+$/.test(code)) {
      throw new Error('Protocol contract bytecode was not found');
    }
  }
  return { status: 'contract-presence-checked', network: name, chainID: config.chain.id,
    paymentReady: false, note: 'Bytecode presence does not verify contract identity, prover, sync, or settlement.' };
}

export function makeReadOnlyRpc(url) {
  const parsed = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) throw new Error('Use HTTPS or a local HTTP RPC');
  let id = 0;
  return async (method, params) => {
    if (!['eth_chainId', 'eth_getCode'].includes(method)) throw new Error('RPC method not allowed');
    try {
      const response = await fetch(url, { method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body.error || body.id !== id || body.jsonrpc !== '2.0') throw new Error();
      return body.result;
    } catch { throw new Error('Read-only RPC request failed; check endpoint access'); }
  };
}
