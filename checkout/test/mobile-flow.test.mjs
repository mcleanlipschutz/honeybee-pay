import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import {setImmediate as tick} from 'node:timers/promises';
import {CHAIN_ID} from '../src/payment.mjs';
import {APP_ORIGIN} from '../src/payment-request.mjs';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const hooksURL=url(`let frame;export const begin=f=>{frame=f;frame.cursor=0;};export function useState(initial){const f=frame,i=f.cursor++;if(!(i in f.slots))f.slots[i]=typeof initial==='function'?initial():initial;return [f.slots[i],v=>f.slots[i]=typeof v==='function'?v(f.slots[i]):v];}export const useRef=i=>useState(()=>({current:i}))[0];export const useEffect=()=>{};export const useCallback=f=>f;export default{Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children})};`);
const hooks=await import(hooksURL);
const viemURL=url(`export * from ${JSON.stringify(import.meta.resolve('viem'))};export const createPublicClient=()=>new Proxy({}, {get:(_,k)=>(...args)=>globalThis.mobileFixture.rpc[k](...args)});`);
let {code}=await transformWithOxc(await readFile(new URL('../src/MobileWallet.jsx',import.meta.url),'utf8'),'MobileWallet.jsx',{jsx:{runtime:'classic'}});
for(const [spec,replacement] of [['react',hooksURL],['viem',viemURL],['viem/chains',import.meta.resolve('viem/chains')],['qrcode',url('export default {};')],['qr-scanner',url('export default class {};')]])code=code.replaceAll(JSON.stringify(spec),JSON.stringify(replacement));
code=code.replace(/from "(\.\/[^\"]+)"/g,(_,spec)=>`from ${JSON.stringify(new URL('../src/'+spec.slice(2),import.meta.url).href)}`);
const {MobileWallet}=await import(url(code));
const nodes=v=>Array.isArray(v)?v.flatMap(nodes):v&&typeof v==='object'&&v.type?[v,...nodes(v.children)]:[];
const text=v=>Array.isArray(v)?v.map(text).join(''):v&&typeof v==='object'?text(v.children):v==null||v===false?'':String(v);
const sender='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222';
function fixture(){
 const records=new Map(),calls=[],frame={slots:[]};let release;
 globalThis.location={href:APP_ORIGIN+'/',hash:'',pathname:'/'};globalThis.history={replaceState:()=>{}};
 globalThis.localStorage={getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(k,options,fn)=>(fn||options)({name:k})}}});
 const rpc={getChainId:async()=>CHAIN_ID,getCode:async()=> '0x1234',readContract:async({functionName})=>functionName==='decimals'?6:10_000_000n,getBalance:async()=>10n**18n,simulateContract:async()=>{},estimateContractGas:async()=>50000n,estimateFeesPerGas:async()=>({maxFeePerGas:10n**9n,maxPriorityFeePerGas:1n}),getBlockNumber:async()=>20n,getTransactionCount:async()=>0,waitForTransactionReceipt:async()=>{throw Error('timeout');}};
 globalThis.mobileFixture={rpc};
 const props={local:true,connection:{ready:true,walletsReady:true,authenticated:true,email:'test@example.invalid',wallet:{address:sender,switchChain:async()=>{},getEthereumProvider:async()=>({request:async({method})=>method==='eth_chainId'?'0xaa36a7':[sender]})},sendTransaction:async(...args)=>{calls.push(args);await new Promise(r=>{release=r;});throw Error('transport ended');}}};
 let tree;const render=()=>{hooks.begin(frame);tree=MobileWallet(props);return tree;};const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);const field=id=>nodes(tree).find(n=>n.props.id===id);render();
 return {props,rpc,calls,records,render,button,field,get tree(){return tree;},release:()=>release?.(),async review(){button('Pay').props.onClick();render();field('payment-input').props.onChange({target:{value:recipient}});field('pay-amount').props.onChange({target:{value:'1'}});render();await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault:()=>{}});render();}};
}
test('new mobile flow reviews without signing, then one explicit click sends exact total and preserves nonce zero',async()=>{
 const f=fixture();await f.review();assert.equal(f.calls.length,0);assert.match(text(f.tree),/Ready to pay/);
 const pay=f.button('Pay 1 USDC');const first=pay.props.onClick();void pay.props.onClick();await tick();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0].nonce,'0x0');assert.equal(f.calls[0][0].gas,60000n);assert.equal(f.calls[0][1].uiOptions.showWalletUIs,false);
 f.release();await first;f.render();assert.match(text(f.tree),/Checking your payment/);assert.equal(f.button('Pay 1 USDC'),undefined);assert.equal([...f.records.values()].map(JSON.parse)[0].status,'pending');
});
test('a changed account blocks the actual send handler before wallet signing',async()=>{
 const f=fixture();await f.review();f.props.connection.authenticated=false;f.render();
 // A stale event from the previous view must not retain authority.
 f.props.connection.authenticated=true;f.render();const pay=f.button('Pay 1 USDC');f.props.connection.wallet.address=recipient;
 await pay.props.onClick();assert.equal(f.calls.length,0);
});
test('email login is enabled before embedded wallets report ready',()=>{
 const f=fixture();f.props.connection.authenticated=false;f.props.connection.walletsReady=false;let count=0;f.props.connection.login=()=>count++;f.render();
 const login=f.button('Continue with email');assert.equal(login.props.disabled,false);login.props.onClick();assert.equal(count,1);
});
test('provider startup errors reach the screen and retry reloads without login or signing',()=>{
 const f=fixture();let reloads=0,logins=0;
 f.props.connection.authenticated=false;f.props.connection.ready=false;
 f.props.connection.error=new Error('Invalid app ID: private-provider-detail');
 f.props.connection.login=()=>logins++;globalThis.location.reload=()=>reloads++;
 f.render();assert.match(text(f.tree),/HB-A04/);assert.ok(!text(f.tree).includes('private-provider-detail'));
 const retry=f.button('Try connecting again');assert.equal(retry.props.disabled,false);retry.props.onClick();
 assert.equal(reloads,1);assert.equal(logins,0);assert.equal(f.calls.length,0);
});
