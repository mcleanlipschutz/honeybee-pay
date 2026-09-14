// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 McLean Lipschutz
// Deterministic adapter only. It does not authenticate a request, prove, or pay.
import { createHash } from 'node:crypto';
const ORIGIN='https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site';
const TOKEN='0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';
const CHAIN=11155111;
const fields=['v','id','chainId','token','recipient','amount','expiresAt'];
const reject=()=>{throw new Error('Unsupported or expired mobile payment request.');};
const bytesAddress=value=>{
 if(typeof value!=='string'||!/^0x[0-9a-f]{40}$/i.test(value)||/^0x0{40}$/i.test(value))reject();
 return new Uint8Array(Buffer.from(value.slice(2).toLowerCase().padStart(64,'0'),'hex'));
};
function amountUnits(amount){
 if(typeof amount!=='string'||!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount))reject();
 const [whole,fraction='']=amount.split('.');const units=BigInt(whole)*1_000_000n+BigInt(fraction.padEnd(6,'0'));
 if(units<=0n||units>10_000_000n)reject();return units;
}
export function invoiceFromMobileRequest(link,{amount,now=Date.now()}={}){
 if(typeof link!=='string'||link.length>4096)reject();
 let url,data;try{url=new URL(link);}catch{reject();}
 if(url.origin!==ORIGIN||url.pathname!=='/'||url.search||url.username||url.password||!/^#pay=[A-Za-z0-9_-]+$/.test(url.hash))reject();
 try{data=JSON.parse(Buffer.from(url.hash.slice(5),'base64url').toString('utf8'));}catch{reject();}
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!fields.includes(k))||data.v!==1
   ||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(data.id||'')
   ||data.chainId!==CHAIN||typeof data.token!=='string'||data.token.toLowerCase()!==TOKEN
   ||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=now||data.expiresAt>now+7*86400000)reject();
 const units=amountUnits(data.amount===''?amount:data.amount);
 if(amount!==undefined&&amountUnits(amount)!==units)reject();
 return Object.freeze({invoiceId:new Uint8Array(createHash('sha256').update('honeybee:mobile-request:v1:'+data.id.toLowerCase()).digest()),
   recipient:bytesAddress(data.recipient),asset:bytesAddress(TOKEN),chainId:BigInt(CHAIN),amount:units,maximum:units});
}
