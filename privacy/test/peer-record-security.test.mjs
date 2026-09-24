import test from 'node:test';
import assert from 'node:assert/strict';
import { findPackageJSON } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { defaultLogger } from '@libp2p/logger';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { PeerRecord, RecordEnvelope } from '@libp2p/peer-record';
import { persistentPeerStore } from '@libp2p/peer-store';
import { multiaddr } from '@multiformats/multiaddr';
import { MemoryDatastore } from 'datastore-core/memory';
import { TypedEventEmitter } from 'main-event';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

test('Waku request IDs use patched UUID and its actual RPC codec round trips',async()=>{
  const wakuRoot=dirname(findPackageJSON('@waku/core',import.meta.url));
  const filterFile=pathToFileURL(join(wakuRoot,'dist/lib/filter/filter_rpc.js'));
  const uuidPackage=findPackageJSON('uuid',filterFile);
  assert.equal(JSON.parse(readFileSync(uuidPackage,'utf8')).version,'11.1.1');
  const {FilterSubscribeRpc}=await import(filterFile.href);
  const request=FilterSubscribeRpc.createSubscribeRequest('/waku/2/test',['/honeybee/test']);
  assert.match(request.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const restored=FilterSubscribeRpc.decode(request.encode());
  assert.equal(restored.requestId,request.requestId);
  assert.deepEqual(restored.contentTopics,['/honeybee/test']);
});

test('installed libp2p uses the patched store and refuses mismatched signed peer identities',async()=>{
  const actual=findPackageJSON('@libp2p/peer-store',import.meta.resolve('libp2p'));
  assert.equal(realpathSync(actual),realpathSync(findPackageJSON('@libp2p/peer-store',import.meta.url)));
  assert.equal(JSON.parse(readFileSync(actual,'utf8')).version,'11.2.7-honeybee.1');
  const [localKey,signerKey,victimKey]=await Promise.all([generateKeyPair('Ed25519'),generateKeyPair('Ed25519'),generateKeyPair('Ed25519')]);
  const signer=peerIdFromPrivateKey(signerKey),victim=peerIdFromPrivateKey(victimKey);
  const store=persistentPeerStore({peerId:peerIdFromPrivateKey(localKey),datastore:new MemoryDatastore(),events:new TypedEventEmitter(),logger:defaultLogger()});
  const address=multiaddr('/ip4/192.0.2.10/tcp/4001');
  const forged=await RecordEnvelope.seal(new PeerRecord({peerId:victim,multiaddrs:[address],seqNumber:99n}),signerKey);
  for(const options of [undefined,{expectedPeer:signer},{expectedPeer:victim}]){
    assert.equal(await store.consumePeerRecord(forged.marshal(),options),false);
    assert.equal(await store.has(victim),false);assert.equal(await store.has(signer),false);
  }
  const valid=await RecordEnvelope.seal(new PeerRecord({peerId:signer,multiaddrs:[address],seqNumber:1n}),signerKey);
  assert.equal(await store.consumePeerRecord(valid.marshal(),{expectedPeer:signer}),true);
  assert.equal((await store.get(signer)).addresses[0].isCertified,true);
  assert.equal(await store.consumePeerRecord(valid.marshal(),{expectedPeer:signer}),false);
});
