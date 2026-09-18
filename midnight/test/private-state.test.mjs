// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openApprovalState } from '../src/private-state.mjs';

test('official SDK encrypts, reopens and restores disposable approval state with context isolation',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'honeybee-midnight-state-'));
  const recoveryDirectory=await mkdtemp(join(tmpdir(),'honeybee-midnight-recovery-'));
  const password='Test-only!'+randomBytes(24).toString('base64');
  const backupPassword='Backup-only!'+randomBytes(24).toString('base64');
  const config={directory,network:'preview',accountId:'disposable-test-account',contractAddress:'ab'.repeat(32),getPassword:()=>password};
  const state={ownerSecret:new Uint8Array(randomBytes(32)),marker:'synthetic-private-invoice-'+randomBytes(16).toString('hex')};
  const opened=[];
  try {
    const store=await openApprovalState(config);opened.push(store);
    const simultaneous=await Promise.allSettled([store.initialize(state),store.initialize(state)]);
    assert.equal(simultaneous.filter(v=>v.status==='fulfilled').length,1);
    await assert.rejects(store.initialize({ownerSecret:new Uint8Array(randomBytes(32))}),/already exists/);
    await store.lock();const reopened=await openApprovalState(config);opened.push(reopened);
    assert.deepEqual(await reopened.read(),state);
    const wrong=await openApprovalState({...config,getPassword:()=>backupPassword});opened.push(wrong);
    await assert.rejects(wrong.read());
    const backup=await reopened.backup(backupPassword);
    assert.ok(!JSON.stringify(backup).includes(state.marker));
    const dbDirectories=await readdir(directory);
    for(const folder of dbDirectories)for(const file of await readdir(join(directory,folder))){
      const bytes=await readFile(join(directory,folder,file));assert.equal(bytes.includes(Buffer.from(state.marker)),false);
    }
    const recovered=await openApprovalState({...config,directory:recoveryDirectory});opened.push(recovered);
    await assert.rejects(recovered.restore(backup,'Wrong-secret!'+randomBytes(24).toString('base64')));
    assert.equal(await recovered.read(),null);
    await recovered.restore(backup,backupPassword);assert.deepEqual(await recovered.read(),state);
    await assert.rejects(recovered.restore(backup,backupPassword),/overwrite/);
    for(const change of [{accountId:'other-account'},{network:'undeployed'},{contractAddress:'cd'.repeat(32)}]){
      const other=await openApprovalState({...config,...change});opened.push(other);
      assert.equal(await other.read(),null);await assert.rejects(other.restore(backup,backupPassword),/context/);
    }
  }finally{for(const s of opened)await s.lock();await rm(directory,{recursive:true,force:true});await rm(recoveryDirectory,{recursive:true,force:true});}
});
