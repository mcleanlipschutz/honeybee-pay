import * as sdk from '@railgun-community/wallet';
import { NETWORK_CONFIG } from '@railgun-community/shared-models';
import { inspectNetwork, makeReadOnlyRpc } from './network-preflight.mjs';

const required = ['generateTransferProof', 'populateProvedTransfer', 'validateRailgunAddress'];
if (required.some(name => typeof sdk[name] !== 'function')) throw new Error('Missing SDK API');
console.log(JSON.stringify({ status: 'sdk-imported', paymentReady: false,
  testConfigurations: Object.values(NETWORK_CONFIG).filter(n => n.isTestnet && !n.deprecated).map(n => n.name) }));
if (!process.env.HONEYBEE_RPC_URL || !process.env.HONEYBEE_NETWORK) {
  console.log('Network check not run. Set HONEYBEE_NETWORK and HONEYBEE_RPC_URL to check test contracts.');
  process.exitCode = 2;
} else {
  try {
    console.log(JSON.stringify(await inspectNetwork(process.env.HONEYBEE_NETWORK, makeReadOnlyRpc(process.env.HONEYBEE_RPC_URL))));
  } catch {
    // Do not print provider errors or URLs, which may contain credentials.
    console.error('Network preflight failed. Verify the test network, endpoint and protocol deployment.');
    process.exitCode = 1;
  }
}
