import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRailgunAddress } from '@railgun-community/wallet';
import { loadRailgunAdapter } from '../src/railgun-loader.mjs';
import { testNetwork, inspectNetwork, makeReadOnlyRpc } from '../src/network-preflight.mjs';

// Public upstream wallet test fixture, not a merchant or a funded wallet.
const fixtureAddress = '0zk1q8hxknrs97q8pjxaagwthzc0df99rzmhl2xnlxmgv9akv32sua0kfrv7j6fe3z53llhxknrs97q8pjxaagwthzc0df99rzmhl2xnlxmgv9akv32sua0kg0zpzts';
test('real SDK decodes an upstream public address fixture', () => {
  assert.equal(validateRailgunAddress(fixtureAddress), true);
  assert.equal(validateRailgunAddress(fixtureAddress.slice(0, -1) + 'q'), false);
});
test('real adapter rejects the Segment 1A fake address before engine access', async () => {
  const prepare = await loadRailgunAdapter();
  await assert.rejects(prepare({ approvedInvoice: { recipient: '0zkTEST_ONLY' }, proposedInvoice: { recipient: '0zkTEST_ONLY' } }), /Invalid RAILGUN address/);
});
test('production, deprecated and unknown configurations are blocked', () => {
  for (const name of ['Ethereum', 'Ethereum_Goerli', 'Arc', '__proto__']) assert.throws(() => testNetwork(name));
});
test('wrong RPC chain stops checks before contract lookup', async () => {
  const calls = [];
  await assert.rejects(inspectNetwork('Ethereum_Sepolia', async method => { calls.push(method); return '0x1'; }), /does not match/);
  assert.deepEqual(calls, ['eth_chainId']);
});
test('empty contract code blocks preflight', async () => {
  await assert.rejects(inspectNetwork('Ethereum_Sepolia', async method => method === 'eth_chainId' ? '0xaa36a7' : '0x'), /bytecode/);
});
test('contract-presence result never claims payment readiness', async () => {
  const result = await inspectNetwork('Ethereum_Sepolia', async method => method === 'eth_chainId' ? '0xaa36a7' : '0x6000');
  assert.equal(result.paymentReady, false);
  assert.equal(result.status, 'contract-presence-checked');
});
test('RPC wrapper rejects plaintext remote endpoints and write methods', async () => {
  assert.throws(() => makeReadOnlyRpc('http://example.com'));
  await assert.rejects(makeReadOnlyRpc('http://127.0.0.1:8545')('eth_sendRawTransaction', []), /not allowed/);
});

test('concurrent read-only RPC responses retain their own request IDs', async t => {
  const pending = new Map();
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body);
    return new Promise(resolve => pending.set(request.id,
      () => resolve(Response.json({ jsonrpc: '2.0', id: request.id, result: request.method }))));
  });
  const rpc = makeReadOnlyRpc('http://127.0.0.1:8545');
  const first = rpc('eth_chainId', []);
  const second = rpc('eth_getBlockByNumber', ['finalized', false]);
  pending.get(2)();
  pending.get(1)();
  assert.deepEqual(await Promise.all([first, second]), ['eth_chainId', 'eth_getBlockByNumber']);
});
