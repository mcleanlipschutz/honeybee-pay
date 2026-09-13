import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentFixture, hash, word } from './payment-fixture.mjs';
import { inspectOriginalPaymentChain } from '../src/payment-chain-recovery.mjs';
import { paymentProxy } from '../src/payment-verification.mjs';
import { walletInterface } from '../src/deployment-check.mjs';
import { paymentFailureDiagnostic, paymentFailureReason } from '../src/payment-diagnostic.mjs';
import { makeReadOnlyRpc } from '../src/network-preflight.mjs';

async function lostAttempt(t) {
  const f = await paymentFixture(t);
  const quote = (await f.run('payment-quote')).privatePayment.quote;
  f.state.sendFailure = true;
  await f.run('payment-submit', { quoteId: quote.quoteId });
  return { ...f, quote, record: (await f.store.read()).payments[0] };
}

test('unspent original notes report a snapshot, retain unknown, and never enable or send a replacement', async t => {
  const f = await lostAttempt(t), events = [], calls = [];
  const data = await f.store.read(); delete data.payments[0].deliveryDiagnostic; await f.store.write(data);
  const prepared = {rpcURL:'http://127.0.0.1:9999',rpc:async(method,params)=>{calls.push(method);return f.rpc(method,params);}};
  const result = await f.run('payment-status', {quoteId:f.quote.quoteId,prepared,
    onStage:(stage,reason)=>events.push({stage,reason}),
    openBroadcaster:()=>{throw Error('Read-only recovery must not contact a broadcaster');}});
  assert.equal(result.privatePayment.status,'unknown');assert.equal(result.privatePayment.hash,null);
  assert.ok(events.some(e=>e.reason==='DELIVERY_REASON_NOT_RECORDED'));
  assert.ok(events.some(e=>e.reason==='NOTES_UNSPENT_AT_CHECK'));
  assert.equal(events.at(-1).reason,'UNKNOWN');assert.equal(calls.includes('eth_getLogs'),false);
  await assert.rejects(f.run('payment-quote'),/unfinished/);
  await assert.rejects(f.run('payment-submit',{quoteId:f.quote.quoteId}),/unfinished/);
  assert.equal(f.state.proofs,1);assert.equal(f.state.sends,1);
});

test('direct chain events recover the exact original receipt when SDK lookup has no hash or throws', async t => {
  for (const unavailable of [false,true]) {
    const f=await lostAttempt(t);f.mined();
    if(unavailable)f.sdk.getCompletedTxidFromNullifiers=async()=>{throw Error('secret SDK text');};
    const events=[];
    const result=await f.run('payment-status',{quoteId:f.quote.quoteId,onStage:(stage,reason)=>events.push({stage,reason}),
      openBroadcaster:()=>{throw Error('Must not reconnect or send');}});
    assert.equal(result.privatePayment.status,'confirmed');assert.equal(result.privatePayment.hash,hash);
    assert.ok(events.some(e=>e.reason==='CHAIN_MATCH_FOUND'));assert.equal(events.at(-1).reason,'CONFIRMED');
    assert.equal(JSON.stringify(events).includes('secret'),false);
    assert.equal(f.state.sends,1);assert.equal(f.state.proofs,1);
  }
});

test('matching discovery logs cannot confirm altered calldata, missing proof events or a reorganized block', async t => {
  for (const mutate of [
    f=>{f.state.tx.input='0x';}, f=>{f.state.receipt.logs.pop();}, f=>{f.state.reorg=true;},
  ]) {
    const f=await lostAttempt(t);f.mined();mutate(f);
    const result=await f.run('payment-status',{quoteId:f.quote.quoteId});
    assert.equal(result.privatePayment.status,'unknown');assert.equal(result.privatePayment.hash,null);
    assert.equal(f.state.sends,1);await assert.rejects(f.run('payment-quote'),/unfinished/);
  }
});

test('spent or partly spent notes with no matching logs search at most eight 512-block windows', async t => {
  for(const partial of [false,true]) {
    const f=await lostAttempt(t),queries=[],events=[];
    const rpc=async(method,params)=>{
      if(method==='eth_getBlockByNumber')return {number:params[0]==='latest'?'0x10000':params[0],hash:word('dd')};
      if(method==='eth_call') {
        const call=walletInterface.parseTransaction({data:params[0].data});
        return walletInterface.encodeFunctionResult('nullifiers',[!partial||call.args[0]===0n]);
      }
      if(method==='eth_getLogs'){queries.push(params[0]);return [];}
      return f.rpc(method,params);
    };
    const result=await inspectOriginalPaymentChain({record:f.record,rpc,checkSession:f.checkSession,onStage:(stage,reason)=>events.push({stage,reason})});
    assert.deepEqual(result.candidates,[]);assert.equal(result.reason,partial?'NOTES_PARTLY_SPENT':'NOTES_SPENT_AT_CHECK');
    assert.equal(queries.length,8);
    for(const query of queries){assert.equal(query.address,paymentProxy);assert.equal(BigInt(query.toBlock)-BigInt(query.fromBlock),511n);assert.equal(query.topics.length,1);}
    assert.equal(BigInt(queries[0].toBlock)-BigInt(queries.at(-1).fromBlock),4095n);
    assert.equal(events.at(-1).reason,'CHAIN_MATCH_NOT_FOUND_IN_WINDOW');
  }
});

test('removed, foreign, partial, out-of-range and oversized log responses do not produce settlement candidates', async t => {
  const f=await lostAttempt(t);f.mined();
  const valid=f.state.receipt.logs.filter(log=>log.topics[0]===walletInterface.getEvent('Nullified').topicHash);
  for(const logs of [
    [valid[0]], valid.map(log=>({...log,removed:true})), valid.map(log=>({...log,address:'0x'+'11'.repeat(20)})),
    valid.map(log=>({...log,blockNumber:'0x999999'})), [valid[0],valid[0]],
    valid.map(log=>({...log,data:log.data+'00'})),
  ]) {
    const rpc=async(method,params)=>method==='eth_getLogs'?logs:f.rpc(method,params);
    const result=await inspectOriginalPaymentChain({record:f.record,rpc,checkSession:f.checkSession});
    assert.deepEqual(result.candidates,[]);
  }
  await assert.rejects(inspectOriginalPaymentChain({record:f.record,checkSession:f.checkSession,
    rpc:async(method,params)=>method==='eth_getLogs'?Array(4097).fill(valid[0]):f.rpc(method,params)}),/log limit/);
});

test('failed or over-budget recovery remains unknown with the exact saved proof and no second send', async t => {
  const f=await lostAttempt(t);f.mined();
  for(const failure of ['network','budget','wrong-chain']) {
    const events=[];
    const rpc=async(method,params)=>{
      if(method==='eth_chainId'&&failure==='wrong-chain')return '0x1';
      if(method==='eth_getLogs') {
        if(failure==='budget')throw Error('Recovery lookup budget exceeded');
        throw Error('password=secret endpoint=https://private-rpc.example/?key=secret');
      }
      return f.rpc(method,params);
    };
    const result=await f.run('payment-status',{quoteId:f.quote.quoteId,prepared:{rpc,rpcURL:'http://127.0.0.1:9999'},onStage:(stage,reason)=>events.push({stage,reason})});
    assert.equal(result.privatePayment.status,'unknown');assert.equal(result.privatePayment.hash,null);
    assert.equal(JSON.stringify(events).includes('secret'),false);
    assert.deepEqual((await f.store.read()).payments[0].populated,f.record.populated);
  }
  assert.equal(f.state.sends,1);assert.equal(f.state.proofs,1);
});

test('broadcast exceptions persist only fixed diagnostics and survive a later read-only check', async t => {
  for(const [error,reason] of [[Error('Request timed out.'),'BROADCAST_RESPONSE_TIMEOUT'],
    [new Error('Received response error from broadcaster.',{cause:Error('private reason')}),'BROADCAST_RESPONSE_ERROR'],
    [Error('secret raw exception'),'SDK_ERROR']]) {
    const f=await paymentFixture(t),quote=(await f.run('payment-quote')).privatePayment.quote;
    f.state.sendFailure=true;f.state.sendError=error;const events=[];
    const result=await f.run('payment-submit',{quoteId:quote.quoteId,onStage:(stage,reason)=>events.push({stage,reason})});
    assert.equal(result.privatePayment.status,'unknown');assert.equal((await f.store.read()).payments[0].deliveryDiagnostic,reason);
    assert.ok(events.some(e=>e.stage==='broadcast'&&e.reason===reason));
    assert.deepEqual(paymentFailureDiagnostic('broadcast',reason),{stage:'broadcast',reason});
    assert.equal(paymentFailureReason(error),reason);
    assert.equal(JSON.stringify(events).includes('private reason'),false);assert.equal(f.state.sends,1);
    const recoveryEvents=[];
    await f.run('payment-status',{quoteId:quote.quoteId,onStage:(stage,reason)=>recoveryEvents.push({stage,reason})});
    assert.ok(recoveryEvents.some(e=>e.stage==='broadcast'&&e.reason===reason));assert.equal(f.state.sends,1);
  }
});

test('a slow chain response hits the lookup deadline and a logout stops subsequent reads', async t => {
  const f=await lostAttempt(t);f.mined();let now=Date.now(),reads=0;
  t.mock.method(Date,'now',()=>now);
  const rpc=async(method,params)=>{reads++;const result=await f.rpc(method,params);if(method==='eth_getLogs')now+=45000;return result;};
  await assert.rejects(inspectOriginalPaymentChain({record:f.record,rpc,checkSession:f.checkSession}),/budget exceeded/);
  const before=reads;
  await assert.rejects(inspectOriginalPaymentChain({record:f.record,rpc,checkSession:()=>{throw Error('Account session expired');}}),/session expired/);
  assert.equal(reads,before);assert.equal(f.state.sends,1);
});

test('read-only RPC allows event lookup but still rejects transaction-sending methods', async t => {
  let calls=0;
  t.mock.method(global,'fetch',async(_url,options)=>{
    const body=JSON.parse(options.body);calls++;assert.equal(body.method,'eth_getLogs');
    return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:[]}),{headers:{'content-type':'application/json'}});
  });
  const rpc=makeReadOnlyRpc('http://127.0.0.1:9999');
  assert.deepEqual(await rpc('eth_getLogs',[{address:paymentProxy}]),[]);
  for(const method of ['eth_sendTransaction','eth_sendRawTransaction','personal_sendTransaction'])await assert.rejects(rpc(method,[]),/not allowed/);
  assert.equal(calls,1);
});
