import { setTimeout as delay } from 'node:timers/promises';
import { connectionErrorCode } from './rpc-transport.mjs';
import { readResponseJSON, poiResponseLimit } from './response-limit.mjs';

// This public availability read contains no wallet data. Retry only a reset
// connection, once, within the original shared 15-second deadline.
export async function checkPOIService(poiURL, checkSession = () => {},
  { fetchImpl = globalThis.fetch, signal = AbortSignal.timeout(15000) } = {}) {
  const endpoint = new URL(poiURL);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('Invalid POI endpoint');
  }
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ppoi_validated_txid',
    params: { chainType: '0', chainID: '11155111', txidVersion: 'V2_PoseidonMerkle' } });
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted(); checkSession();
    let response, poi;
    try {
      response = await fetchImpl(poiURL, { method: 'POST', redirect: 'error', signal,
        headers: { 'content-type': 'application/json' }, body });
      poi = await readResponseJSON(response, { maximumBytes: poiResponseLimit, signal });
    } catch (error) {
      signal.throwIfAborted(); checkSession();
      if (attempt !== 0 || (response && !response.ok) || connectionErrorCode(error) !== 'ECONNRESET') throw error;
      try { await delay(250, undefined, { signal }); }
      catch (interrupted) { signal.throwIfAborted(); throw interrupted; }
      continue;
    }
    signal.throwIfAborted(); checkSession();
    if (!response.ok || poi?.error || poi?.id !== 1 || !Number.isSafeInteger(poi?.result?.validatedTxidIndex)
        || poi.result.validatedTxidIndex < 0 || !/^[0-9a-fA-F]{64}$/.test(poi.result.validatedTxidMerkleroot)) {
      throw new Error('POI service unavailable');
    }
    return { status: 'poi-service-ready', network: 'Ethereum_Sepolia', paymentReady: false };
  }
}
