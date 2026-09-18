// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyBuild, LOGIC_ARTIFACTS, PROOF_ARTIFACTS } from '../src/verify-build.mjs';
import { checkProofService, localProofUrl } from '../src/proof-readiness.mjs';

test('artifact gate verifies source, pinned runtime and every proving/verifying artifact', () => {
  const root = mkdtempSync(join(tmpdir(), 'honeybee-artifact-check-'));
  const put = (path, data) => { const p=join(root,path);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,data); };
  const hash = value => createHash('sha256').update(value).digest('hex');
  try {
    put('contracts/approval.compact', 'fixture-source');
    put('node_modules/@midnight-ntwrk/compact-runtime/package.json', JSON.stringify({version:'0.16.0'}));
    const build={compiler:'0.31.1',runtime:'0.16.0',fullBuild:true,sourceSha256:hash('fixture-source'),artifacts:{}};
    for(const name of [...LOGIC_ARTIFACTS,...PROOF_ARTIFACTS]) {put('managed/approval/'+name,name);build.artifacts[name]=hash(name);}
    const save=()=>put('managed/approval/build.json',JSON.stringify(build));save();
    assert.equal(verifyBuild({root}).artifactCount,7);
    for(const name of [...LOGIC_ARTIFACTS,...PROOF_ARTIFACTS]){
      put('managed/approval/'+name,'changed');assert.throws(()=>verifyBuild({root}),/artifacts/);put('managed/approval/'+name,name);
    }
    put('contracts/approval.compact','old-source');assert.throws(()=>verifyBuild({root}));put('contracts/approval.compact','fixture-source');
    build.fullBuild=false;save();assert.throws(()=>verifyBuild({root}));assert.equal(verifyBuild({root,requireFull:false}).artifactCount,3);
    put('node_modules/@midnight-ntwrk/compact-runtime/package.json',JSON.stringify({version:'0.17.0'}));assert.throws(()=>verifyBuild({root,requireFull:false}));
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('proof preflight rejects remote endpoints before contacting them',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error();};
  for(const url of ['https://prover.example','http://localhost.evil:6300','http://127.0.0.1:6300/private','http://secret@127.0.0.1:6300','http://127.0.0.1:6300/?key=secret'])
    await assert.rejects(checkProofService({url,fetcher}));
  assert.equal(calls,0);assert.equal(localProofUrl(),'http://127.0.0.1:6300');
});

test('readiness checks only GET local metadata, enforce the version and do not prove or pay',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{calls.push({url,options});return new Response(url.endsWith('/version')?'8.1.0':JSON.stringify({status:'ok'}));};
  assert.deepEqual(await checkProofService({fetcher}),{ready:true,version:'8.1.0',privateInputsSent:false});
  assert.equal(calls.length,3);
  for(const {url,options} of calls){assert.ok(url.startsWith('http://127.0.0.1:6300/'));assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');}
  for(const fetcher of [async()=>new Response('8.2.0'),async()=>new Response('x'.repeat(4097)),async()=>{throw Error('SECRET_PROVIDER_DETAIL');}]){
    const result=await checkProofService({fetcher});assert.equal(result.ready,false);assert.ok(!JSON.stringify(result).includes('SECRET_PROVIDER_DETAIL'));
  }
});
