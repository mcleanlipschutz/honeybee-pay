import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, erc20Abi } from 'viem';
import { CHAIN_ID, USDC, approvePayment, buildTransfer } from '../src/payment.mjs';
import { makeRequest, requestLink, parsePaymentInput, validateRequest, APP_ORIGIN } from '../src/payment-request.mjs';
import { reviewPayment, revalidatePayment } from '../src/automatic-fees.mjs';
import { attemptKey, beginAttempt, saveAttempt, readAttempt, inspectAttempt, isExplicitRejection } from '../src/mobile-attempt.mjs';
const sender='0x1111111111111111111111111111111111111111', recipient='0x2222222222222222222222222222222222222222';
const now=Date.now();
function rpc() { return {getChainId:async()=>CHAIN_ID,getCode:async()=> '0x1234',readContract:async({functionName})=>functionName==='decimals'?6:10_000_000n,getBalance:async()=>10n**18n,simulateContract:async()=>({}),estimateContractGas:async()=>50_000n,estimateFeesPerGas:async()=>({maxFeePerGas:1_000_000_000n,maxPriorityFeePerGas:1_000_000n})}; }
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('mobile requests round-trip exact recipient/amount/network and optional amounts',()=>{
 const r=makeRequest({recipient,amount:'1.230000'},now), link=requestLink(r,now);
 assert.equal(parsePaymentInput(link,now).amount,'1.23');assert.equal(parsePaymentInput(link,now).recipient,recipient);
 assert.equal(new URL(link).search,'');assert.equal(new URL(link).pathname,'/');
 assert.equal(parsePaymentInput(requestLink(makeRequest({recipient},now),now),now).amount,'');
 assert.equal(parsePaymentInput(`ethereum:${USDC}@${CHAIN_ID}/transfer?address=${recipient}&uint256=1230000`,now).amount,'1.23');
 assert.equal(parsePaymentInput(`ethereum:${recipient}@${CHAIN_ID}`,now).recipient,recipient);
});
test('requests reject substituted networks/tokens, expired data, contract calls and misleading origins',()=>{
 const r=makeRequest({recipient,amount:'1'},now);
 for(const change of [{chainId:1},{token:sender},{recipient:'0x'+'0'.repeat(40)},{expiresAt:now},{expiresAt:now+8*86400000},{amount:'1e0'},{amount:'10.000001'},{amount:'0'},{amount:'1.0000001'},{data:'0x1234'}]) assert.throws(()=>validateRequest({...r,...change},now));
 for(const raw of [requestLink(r,now).replace(APP_ORIGIN,'https://evil.example'),`ethereum:${recipient}@1`,`ethereum:${USDC}@${CHAIN_ID}/approve?address=${recipient}&uint256=1`,`ethereum:${USDC}@${CHAIN_ID}/transfer?address=${recipient}&uint256=1&uint256=2`,`ethereum:${USDC}@${CHAIN_ID}/transfer?address=${recipient}&uint256=1&gas=10`,'javascript:alert(1)','x'.repeat(4097)])assert.throws(()=>parsePaymentInput(raw,now));
});
test('automatic fees simulate exact payment, add bounded gas buffer, and never increase reviewed ceiling',async()=>{
 const client=rpc(), calls=[];client.simulateContract=async args=>calls.push(args);
 const r=await reviewPayment({rpc:client,sender,recipient,amount:'1'});
 assert.equal(r.transaction.gas,60000n);assert.equal(r.maximumFee,'60000000000000');assert.equal(r.transaction.value,0n);assert.equal(calls[0].args[0],recipient);
 client.estimateFeesPerGas=async()=>({maxFeePerGas:999n*10n**9n,maxPriorityFeePerGas:1n});
 const tx=await revalidatePayment({rpc:client,review:r,sender});assert.equal(tx.maxFeePerGas,1_000_000_000n);assert.equal(tx,r.transaction);
 await assert.rejects(revalidatePayment({rpc:client,review:r,sender,now:r.expiresAt}),/updating/);
 await assert.rejects(revalidatePayment({rpc:client,review:r,sender:recipient}),/Wallet/);
});
test('wrong chain, failed simulation, insufficient balances, fee spikes and changed requests stop payment',async()=>{
 for(const [key,value] of [['getChainId',async()=>1],['getBalance',async()=>0n],['estimateFeesPerGas',async()=>({maxFeePerGas:10n**15n,maxPriorityFeePerGas:1n})],['simulateContract',async()=>{throw Error('revert');}],['readContract',async({functionName})=>functionName==='decimals'?6:0n]])await assert.rejects(reviewPayment({rpc:{...rpc(),[key]:value},sender,recipient,amount:'1'}));
 await assert.rejects(reviewPayment({rpc:rpc(),sender,recipient,amount:'2',request:makeRequest({recipient,amount:'1'})}),/changed/);
 const client=rpc(), r=await reviewPayment({rpc:client,sender,recipient,amount:'1'});client.getBalance=async()=>0n;await assert.rejects(revalidatePayment({rpc:client,review:r,sender}),/balance for fees/);
});
test('unknown payment survives refresh and blocks retries; unavailable or corrupt storage fails closed',()=>{
 const storage=memory(),approved=approvePayment({sender,recipient,amount:'1'}),data={approved,afterBlock:'10',nonce:2,createdAt:Date.now()};
 const attempt=beginAttempt(storage,sender,data);assert.equal(readAttempt(storage,sender).status,'pending');
 assert.throws(()=>beginAttempt(storage,sender,data),/previous payment/);
 assert.throws(()=>beginAttempt({getItem:()=>null,setItem:()=>{}},sender,data),/storage/);
 storage.setItem(attemptKey(sender),'bad');assert.throws(()=>readAttempt(storage,sender));
 saveAttempt(storage,sender,{...attempt,status:'confirmed'});assert.equal(beginAttempt(storage,sender,data).status,'pending');
 assert.equal(isExplicitRejection({code:4001}),true);assert.equal(isExplicitRejection({message:'User rejected',code:500}),false);
});
function minedFixture() {
 const approved=approvePayment({sender,recipient,amount:'1'}),hash='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32);
 const attempt={version:1,approved,afterBlock:'10',nonce:2,status:'pending',hash};
 const receipt={status:'success',transactionHash:hash,blockNumber:12n,blockHash,logs:[{address:USDC,blockHash,transactionHash:hash,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:sender,to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[1_000_000n])}]};
 const tx={hash,nonce:2,from:sender,to:USDC,value:0n,input:buildTransfer(approved,approved,sender).data,blockNumber:12n,blockHash};
 return {attempt,receipt,tx,rpc:{getChainId:async()=>CHAIN_ID,getBlockNumber:async()=>13n,getTransactionReceipt:async()=>receipt,getTransaction:async()=>tx,getBlock:async()=>({number:12n,hash:blockHash})}};
}
test('recovery verifies canonical exact transfer and nonce; old receipts cannot clear an uncertain send',async()=>{
 const f=minedFixture();assert.equal((await inspectAttempt(f.rpc,f.attempt)).status,'confirmed');
 for(const [key,value] of [['nonce',3],['from',recipient],['to',recipient],['value',1n],['input','0x'],['blockHash','0x'+'ee'.repeat(32)]]){const saved=f.tx[key];f.tx[key]=value;assert.equal(await inspectAttempt(f.rpc,f.attempt),null);f.tx[key]=saved;}
 f.receipt.status='reverted';f.receipt.logs=[];assert.equal((await inspectAttempt(f.rpc,f.attempt)).status,'failed');
 f.rpc.getBlockNumber=async()=>12n;assert.equal(await inspectAttempt(f.rpc,f.attempt),null);
});

test('delayed recovery cannot overwrite a newer pending payment or downgrade a terminal one',async()=>{
 const {commitAttemptResult}=await import('../src/mobile-attempt.mjs');
 const storage=memory(),approved=approvePayment({sender,recipient,amount:'1'}),data={approved,afterBlock:'10',nonce:2,createdAt:Date.now()};
 const first=beginAttempt(storage,sender,data);
 commitAttemptResult(storage,sender,{...first,status:'confirmed'});
 const next=beginAttempt(storage,sender,{...data,nonce:3});
 assert.notEqual(first.id,next.id);
 assert.equal(commitAttemptResult(storage,sender,{...first,status:'confirmed'}).id,next.id);
 assert.equal(readAttempt(storage,sender).status,'pending');
 commitAttemptResult(storage,sender,{...next,status:'confirmed'});
 assert.equal(commitAttemptResult(storage,sender,next).status,'confirmed');
});

test('corrupt stored payment details cannot reach the money display',()=>{
 const storage=memory(),approved=approvePayment({sender,recipient,amount:'1'}), original=beginAttempt(storage,sender,{approved,afterBlock:'10',nonce:0,createdAt:Date.now()});
 for(const change of [{amountUnits:'bad'},{amountUnits:'0'},{amountUnits:'10000001'},{recipient:'bad'},{recipient:sender},{expiresAt:'yesterday'}]){ storage.setItem(attemptKey(sender),JSON.stringify({...original,approved:{...approved,...change}}));assert.throws(()=>readAttempt(storage,sender)); }
});
