// Read-only diagnostics for the pinned Waku client. Only public fee-token
// contract addresses are exported: no peer/account addresses, fee payloads,
// account data or raw SDK errors. Observed offers are not payment authorization.
const counts = [
  'maxDiscoveredPeers', 'maxConnectedPeers', 'maxFilterPeers', 'maxStorePeers',
  'maxLightPushV2Peers', 'maxLightPushV3Peers', 'maxConfiguredTopics',
  'maxEligibleSepoliaOffers', 'maxEligibleRequestedTokenOffers', 'feeMessagesObserved',
  'feeUpdatesObserved', 'skippedVersion', 'skippedPOI', 'skippedExpired',
];
const statuses = new Set(['Disconnected', 'Searching', 'Connected', 'AllUnavailable', 'Error']);
const events = new Set(['unknown', 'creating-client', 'waiting-for-peers', 'peers-connected',
  'subscribing', 'listening', 'reading-fee-history', 'fee-message', 'fee-update']);
const failures = new Set(['none', 'peer-start-failed', 'subscription-failed', 'fee-history-failed',
  'sdk-error', 'peer-store-unavailable']);
const boundedCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 10000 ? value : 0;
const tokenAddress = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
  && !/^0x0{40}$/.test(value) ? value.toLowerCase() : null;
const tokenAddresses = value => Array.isArray(value)
  ? [...new Set(value.slice(0, 10000).map(tokenAddress).filter(Boolean))].sort().slice(0, 16) : [];

export function sanitizeBroadcasterDiagnostics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    sampled: value.sampled === true,
    clientStartedObserved: value.clientStartedObserved === true,
    statusesObserved: Array.isArray(value.statusesObserved)
      ? [...new Set(value.statusesObserved.filter(status => statuses.has(status)))].slice(0, 5) : [],
    lastEvent: events.has(value.lastEvent) ? value.lastEvent : 'unknown',
    lastFailure: failures.has(value.lastFailure) ? value.lastFailure : 'none',
    requestedFeeToken: tokenAddress(value.requestedFeeToken),
    observedFeeTokenAddresses: tokenAddresses(value.observedFeeTokenAddresses),
    feeTokenStatus: boundedCount(value.maxEligibleRequestedTokenOffers) > 0 ? 'requested-token-offer-observed'
      : boundedCount(value.maxEligibleSepoliaOffers) > 0 ? 'other-token-offers-only' : 'no-eligible-offers-observed',
    ...Object.fromEntries(counts.map(key => [key, boundedCount(value[key])])),
  };
}

export function createBroadcasterDiagnostics(client, chain, token, { sampleTimeoutMs = 1000, useRelayAdapt = false } = {}) {
  const state = sanitizeBroadcasterDiagnostics({ requestedFeeToken: token });
  let pending;
  const increment = key => { state[key] = Math.min(10000, state[key] + 1); };
  const peak = (key, value) => { state[key] = Math.max(state[key], boundedCount(value)); };
  const snapshot = () => sanitizeBroadcasterDiagnostics(state);
  const observe = (kind, value) => {
    if (kind === 'status') {
      if (statuses.has(value) && !state.statusesObserved.includes(value)) state.statusesObserved.push(value);
      return;
    }
    if (kind === 'error') { state.lastFailure = 'sdk-error'; return; }
    if (kind !== 'log' || typeof value !== 'string') return;
    const message = value.slice(0, 600);
    if (message.startsWith('Creating waku broadcast client')) state.lastEvent = 'creating-client';
    else if (message.startsWith('Waiting for remote peer')) state.lastEvent = 'waiting-for-peers';
    else if (message.startsWith('Waku initialized and connected to peers')) state.lastEvent = 'peers-connected';
    else if (message.startsWith('Add Waku observers for chain:')) state.lastEvent = 'subscribing';
    else if (message.startsWith('Waku listening for events on chain:')) state.lastEvent = 'listening';
    else if (message.startsWith('Polling historical messages')) state.lastEvent = 'reading-fee-history';
    else if (message.startsWith('Error initializing Waku:')) state.lastFailure = 'peer-start-failed';
    else if (message.startsWith('Error adding Observers.')) state.lastFailure = 'subscription-failed';
    else if (message.startsWith('Error retrieving historical messages:')) state.lastFailure = 'fee-history-failed';
    else if (message.startsWith('Broadcaster Fee receipt SUCCESS') || message.startsWith('Broadcaster Fee STALE:')) {
      state.lastEvent = 'fee-message'; increment('feeMessagesObserved');
    } else if (message.startsWith('[Fees] Updating fees for ')) {
      state.lastEvent = 'fee-update'; increment('feeUpdatesObserved');
    } else if (message.startsWith('Skipping Broadcaster outside version range:') || message.startsWith('[Fees] Broadcaster version ')) {
      increment('skippedVersion');
    } else if (message.startsWith('[Fees] Broadcaster ') && message.includes('requires POI list key ') && message.endsWith('which is not active.')) {
      increment('skippedPOI');
    } else if (message.startsWith('Skipping fee message. Timestamp Expired.') || message.startsWith('[Fees] Fees expired for ')) {
      increment('skippedExpired');
    }
  };
  async function collect() {
    let timer;
    try {
      const core = client.getWakuCore();
      const connected = core?.libp2p?.getConnections?.() || [];
      const connectedIds = new Set(connected.slice(0, 10000).map(c => c.remotePeer.toString()));
      peak('maxConnectedPeers', connected.length);
      state.clientStartedObserved ||= client.isStarted() === true;
      peak('maxConfiguredTopics', client.getContentTopics()?.length || 0);
      const offers = client.findAllBroadcastersForChain(chain, useRelayAdapt) || [];
      peak('maxEligibleSepoliaOffers', offers.length);
      // Read only SDK-filtered eligible offers, never unverified fee messages.
      // Preserve a bounded union across samples so expiry cannot erase evidence.
      state.observedFeeTokenAddresses = tokenAddresses([
        ...state.observedFeeTokenAddresses,
        ...offers.slice(0, 10000).map(offer => offer?.tokenAddress),
      ]);
      peak('maxEligibleRequestedTokenOffers', client.findBroadcastersForToken(chain, token, useRelayAdapt)?.length || 0);
      if (!core?.libp2p?.peerStore?.all) return;
      const peers = await Promise.race([
        core.libp2p.peerStore.all(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), sampleTimeoutMs); }),
      ]);
      if (!Array.isArray(peers)) throw new Error();
      state.sampled = true;
      peak('maxDiscoveredPeers', peers.length);
      const live = peers.slice(0, 10000).filter(p => connectedIds.has(p.id.toString()));
      const protocols = {
        maxFilterPeers: '/vac/waku/filter-subscribe/2.0.0-beta1',
        maxStorePeers: '/vac/waku/store-query/3.0.0',
        maxLightPushV2Peers: '/vac/waku/lightpush/2.0.0-beta1',
        maxLightPushV3Peers: '/vac/waku/lightpush/3.0.0',
      };
      for (const [key, protocol] of Object.entries(protocols)) {
        peak(key, live.filter(p => Array.isArray(p.protocols) && p.protocols.includes(protocol)).length);
      }
    } catch { state.lastFailure = 'peer-store-unavailable'; }
    finally { clearTimeout(timer); }
  }
  return {
    observe, snapshot,
    async sample() {
      // Polls never overlap and cannot hold up the outer discovery deadline.
      if (!pending) pending = collect().finally(() => { pending = undefined; });
      await pending;
      return snapshot();
    },
  };
}
