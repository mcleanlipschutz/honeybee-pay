// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceFromMobileRequest} from '../src/mobile-invoice.mjs';
import {ApprovalSimulator,bytes32} from '../src/simulator.mjs';
const now=Date.now();
const request={v:1,id:'16e02a9e-c754-4fda-b7ec-f2e8615507ad',chainId:11155111,token:'0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',recipient:'0x2222222222222222222222222222222222222222',amount:'1.25',expiresAt:now+86400000};
const link=r=>'https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site/#pay='+Buffer.from(JSON.stringify(r)).toString('base64url');
test('a mobile request maps to exact Compact terms and passes one approval/consumption in simulation',()=>{
 const invoice=invoiceFromMobileRequest(link(request),{now}),sim=new ApprovalSimulator(),salt=bytes32();
 assert.equal(invoice.amount,1250000n);assert.equal(invoice.maximum,1250000n);assert.equal(invoice.recipient.length,32);
 sim.execute('approve',invoice,salt);sim.execute('consume',invoice,salt);assert.throws(()=>sim.execute('consume',invoice,salt));
});
test('request mutation cannot consume the original approval commitment',()=>{
 const sim=new ApprovalSimulator(),salt=bytes32(),invoice=invoiceFromMobileRequest(link(request),{now});sim.execute('approve',invoice,salt);
 for(const change of [{amount:'1.26'},{recipient:'0x3333333333333333333333333333333333333333'},{id:'26e02a9e-c754-4fda-b7ec-f2e8615507ad'}]) assert.throws(()=>sim.execute('consume',invoiceFromMobileRequest(link({...request,...change}),{now}),salt));
});
test('adapter rejects expiry, wrong network/token, extra calls and conflicting amounts',()=>{
 for(const change of [{expiresAt:now},{chainId:1},{token:request.recipient},{amount:'1e0'},{amount:'10.000001'},{data:'0x1234'}])assert.throws(()=>invoiceFromMobileRequest(link({...request,...change}),{now}));
 assert.throws(()=>invoiceFromMobileRequest(link(request),{amount:'2',now}));
 const open=link({...request,amount:''});assert.throws(()=>invoiceFromMobileRequest(open,{now}));assert.equal(invoiceFromMobileRequest(open,{amount:'2',now}).amount,2000000n);
});
