import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcasterDiagnostics, sanitizeBroadcasterDiagnostics } from '../src/broadcaster-diagnostics.mjs';

const chain = { type: 0, id: 11155111 }, token = 'test-token';
const secret = 'synthetic-private-string';
function fixture() {
  const network = { connected: [], peers: [], started: false, topics: [], chainOffers: [], tokenOffers: [] };
  const client = {
    getWakuCore: () => ({ libp2p: { getConnections: () => network.connected, peerStore: { all: async () => network.peers } } }),
    isStarted: () => network.started,
    getContentTopics: () => network.topics,
    findAllBroadcastersForChain: (c, relay) => { assert.equal(c, chain); assert.equal(relay, false); return network.chainOffers; },
    findBroadcastersForToken: (c, t, relay) => { assert.equal(c, chain); assert.equal(t, token); assert.equal(relay, false); return network.tokenOffers; },
  };
  return { network, client };
}

test('read-only samples distinguish discovered peers, connected protocols and eligible token offers', async () => {
  const { network, client } = fixture();
  const diagnostics = createBroadcasterDiagnostics(client, chain, token);
  network.peers = [{ id: secret, protocols: [] }];
  let state = await diagnostics.sample();
  assert.equal(state.maxDiscoveredPeers, 1); assert.equal(state.maxConnectedPeers, 0);
  network.connected = [{ remotePeer: secret }];
  network.peers[0].protocols = ['/vac/waku/filter-subscribe/2.0.0-beta1', '/vac/waku/store-query/3.0.0', '/vac/waku/lightpush/2.0.0-beta1'];
  network.started = true; network.topics = [secret, secret]; network.chainOffers = [{ private: secret }];
  diagnostics.observe('status', 'Connected');
  state = await diagnostics.sample();
  assert.equal(state.maxConnectedPeers, 1); assert.equal(state.maxFilterPeers, 1);
  assert.equal(state.maxStorePeers, 1); assert.equal(state.maxLightPushV2Peers, 1); assert.equal(state.maxLightPushV3Peers, 0);
  assert.equal(state.clientStartedObserved, true); assert.equal(state.maxEligibleSepoliaOffers, 1);
  assert.equal(state.maxEligibleTestUSDCOffers, 0);
  network.tokenOffers = [secret]; network.peers[0].protocols.push('/vac/waku/lightpush/3.0.0');
  state = await diagnostics.sample();
  assert.equal(state.maxEligibleTestUSDCOffers, 1); assert.equal(state.maxLightPushV3Peers, 1);
  network.peers = []; network.connected = []; network.started = false;
  state = await diagnostics.sample();
  assert.equal(state.maxConnectedPeers, 1); assert.equal(state.clientStartedObserved, true);
  assert.ok(!JSON.stringify(state).includes(secret));
});

test('SDK logs become fixed stage and rejection counters without exposing payloads or errors', () => {
  const { client } = fixture(), diagnostic = createBroadcasterDiagnostics(client, chain, token);
  for (const [message, expected] of [
    ['Waiting for remote peer.', 'waiting-for-peers'],
    ['Add Waku observers for chain: ' + secret, 'subscribing'],
    ['Waku listening for events on chain: ' + secret, 'listening'],
    ['Polling historical messages', 'reading-fee-history'],
  ]) { diagnostic.observe('log', message); assert.equal(diagnostic.snapshot().lastEvent, expected); }
  diagnostic.observe('log', 'Error adding Observers. ' + secret);
  diagnostic.observe('log', 'Broadcaster Fee receipt SUCCESS in ' + secret);
  diagnostic.observe('log', '[Fees] Updating fees for ' + secret);
  diagnostic.observe('log', 'Skipping Broadcaster outside version range: ' + secret);
  diagnostic.observe('log', '[Fees] Broadcaster ' + secret + ' requires POI list key ' + secret + ', which is not active.');
  diagnostic.observe('log', '[Fees] Fees expired for ' + secret);
  diagnostic.observe('status', secret);
  const state = diagnostic.snapshot();
  assert.equal(state.lastFailure, 'subscription-failed'); assert.equal(state.feeMessagesObserved, 1);
  assert.equal(state.feeUpdatesObserved, 1); assert.equal(state.skippedVersion, 1);
  assert.equal(state.skippedPOI, 1); assert.equal(state.skippedExpired, 1);
  assert.ok(!JSON.stringify(state).includes(secret));
  assert.equal(sanitizeBroadcasterDiagnostics(null), null);
  const filtered = sanitizeBroadcasterDiagnostics({ password: secret, maxConnectedPeers: Infinity,
    maxStorePeers: -1, paymentReady: true, statusesObserved: ['Connected', secret, 'Connected'] });
  assert.equal(filtered.maxConnectedPeers, 0); assert.equal(filtered.maxStorePeers, 0);
  assert.deepEqual(filtered.statusesObserved, ['Connected']); assert.equal(filtered.paymentReady, undefined);
  assert.ok(!JSON.stringify(filtered).includes(secret));
});

test('a stalled peer store is bounded and concurrent diagnostic polls never duplicate the read', async () => {
  const { client } = fixture(); let calls = 0;
  client.getWakuCore = () => ({ libp2p: { getConnections: () => [], peerStore: {
    all: () => { calls++; return new Promise(() => {}); },
  } } });
  const diagnostic = createBroadcasterDiagnostics(client, chain, token, { sampleTimeoutMs: 15 });
  const [first, second] = await Promise.all([diagnostic.sample(), diagnostic.sample()]);
  assert.equal(calls, 1); assert.equal(first.lastFailure, 'peer-store-unavailable');
  assert.equal(first.sampled, false); assert.deepEqual(first, second);
});

test('optional diagnostic observers cannot change broadcaster selection or make an SDK error succeed', async () => {
  const { WakuBroadcasterClient: client } = await import('@railgun-community/waku-broadcaster-client-node');
  const { openPaymentBroadcaster } = await import('../src/payment-broadcaster.mjs');
  const originals = Object.fromEntries(['start', 'stop', 'findBestBroadcaster', 'findBroadcastersForToken'].map(k => [k, client[k]]));
  const selected = { railgunAddress: 'synthetic-recipient', tokenFee: { feesID: 'synthetic-fee', feePerUnitGas: '1', expiration: Date.now() + 120000 } };
  try {
    client.start = async (c, options, status, logger) => {
      assert.deepEqual(c, chain); assert.deepEqual(options, { enableHealthcheckLogs: false });
      status(c, 'Connected'); logger.log(secret); logger.error(new Error(secret));
    };
    client.stop = async () => {};
    client.findBestBroadcaster = () => selected;
    client.findBroadcastersForToken = () => [selected];
    const result = await openPaymentBroadcaster(() => {}, undefined, () => { throw new Error(secret); });
    assert.deepEqual(result.selected, selected);
    client.start = async () => { throw new Error('synthetic-start-failure'); };
    await assert.rejects(openPaymentBroadcaster(() => {}, undefined, () => {}), /synthetic-start-failure/);
  } finally { Object.assign(client, originals); }
});
