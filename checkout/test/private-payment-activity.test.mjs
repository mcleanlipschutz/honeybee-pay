import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';

// Actual JSX handlers, with explicit hook/form doubles; no browser or wallet.
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hooksURL = moduleURL(`
let frame;
export const begin = value => { frame = value; frame.cursor = 0; };
export function useState(initial) {
  const index = frame.cursor++, current = frame;
  if (!(index in current.slots)) current.slots[index] = typeof initial === 'function' ? initial() : initial;
  return [current.slots[index], value => { current.slots[index] = typeof value === 'function' ? value(current.slots[index]) : value; }];
}
export function useRef(initial) { return useState(() => ({current:initial}))[0]; }
export function useEffect() {}
export class FormData {
  constructor(form) { this.values = Object.fromEntries(Object.entries(form.fields).map(([key,field]) => [key,field.value])); }
  get(key) { return this.values[key] ?? null; }
}
export default {Fragment:'fragment',createElement:(type,props,...children) => ({type,props:props||{},children})};
`);
const hooks = await import(hooksURL);
const source = await readFile(new URL('../src/PrivatePaymentActivity.jsx', import.meta.url), 'utf8');
let { code } = await transformWithOxc(source, 'PrivatePaymentActivity.jsx', { jsx: { runtime: 'classic' } });
for (const [specifier, replacement] of [
  ['react', hooksURL], ['viem', import.meta.resolve('viem')],
  ['../../shared/test-assets.mjs', new URL('../../shared/test-assets.mjs', import.meta.url).href],
]) code = code.replaceAll(JSON.stringify(specifier), JSON.stringify(replacement));
const { PrivatePaymentActivity } = await import(moduleURL(`import {FormData} from ${JSON.stringify(hooksURL)};\n${code}`));
const nodes = value => Array.isArray(value) ? value.flatMap(nodes)
  : value && typeof value === 'object' && value.type ? [value, ...nodes(value.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('')
  : value && typeof value === 'object' ? text(value.children) : value == null || value === false ? '' : String(value);

function fixture(deliveryKind = 'original-payload') {
  const frame = {slots:[],cursor:0}, calls = [];
  let current = true, hold;
  const fields = {password:{value:'test-only-recovery-password'}};
  const form = {fields, reset:()=>{fields.password.value='';}, reportValidity:()=>fields.password.value.length >= 16};
  const quote = {version:2,quoteId:'fixture-quote',request:{id:'fixture-request',amountUnits:'1000000',recipient:'fixture-merchant',expiresAt:Math.floor(Date.now()/1000)+3600},feeUnits:'3478483953903483'};
  const row = {quote,status:'unknown',hash:null};
  let review;
  const props = {wallet:{id:'fixture'},disabled:false,isCurrent:()=>current,
    transact:async(action,input,wallet,expectedQuote)=>{
      calls.push({action,input:{...input},wallet,expectedQuote});
      if (hold) await hold;
      if(action==='payment-history')return {privatePayments:[row]};
      if(action==='payment-redelivery-review'){
        review={deliveryKind,reviewId:'fixture-review',quoteId:quote.quoteId,expiresAt:Date.now()+300000};
        return {privatePayment:row,deliveryReview:review};
      }
      return {privatePayment:{...row,status:action==='payment-redelivery-submit'?'pending':'unknown',hash:action==='payment-redelivery-submit'?'0x'+'11'.repeat(32):null}};
    }};
  let tree;
  const render=()=>{hooks.begin(frame);tree=PrivatePaymentActivity(props);nodes(tree).find(n=>n.type==='form').props.ref.current=form;return tree;};
  const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n).startsWith(label));
  render();
  const click=async label=>{fields.password.value='test-only-recovery-password';button(label).props.onClick();await turn();render();};
  return {frame,calls,fields,props,button,render,click,hold:value=>{hold=value;},logout:()=>{current=false;},
    get tree(){return tree;},get review(){return review;},row,
    enter(){let prevented=false;nodes(tree).find(n=>n.type==='form').props.onKeyDown({key:'Enter',target:{tagName:'INPUT'},preventDefault:()=>{prevented=true;}});return prevented;}};
}

test('opening history and reviewing original delivery never submits; review shows exact saved costs', async()=>{
  const f=fixture();await f.click('Open saved');await f.click('Review payment');
  assert.deepEqual(f.calls.map(c=>c.action),['payment-history','payment-redelivery-review']);
  assert.equal(f.fields.password.value,'');
  assert.match(text(f.tree),/0\.003478483953903483 Sepolia WETH/);
  assert.match(text(f.tree),/Re-enter your recovery password/);
  assert.equal(f.button('Confirm original').props.type,'button');
  assert.equal(f.calls[1].expectedQuote,f.row.quote);
});

test('Enter and blank password cannot send, and double-click confirms the exact review only once', async()=>{
  const f=fixture();await f.click('Open saved');await f.click('Review payment');
  assert.equal(f.enter(),true);f.button('Confirm original').props.onClick();await turn();assert.equal(f.calls.length,2);
  f.fields.password.value='test-only-recovery-password';
  let release;f.hold(new Promise(resolve=>{release=resolve;}));
  const confirm=f.button('Confirm original');confirm.props.onClick();confirm.props.onClick();
  assert.equal(f.calls.length,3);assert.equal(f.calls[2].action,'payment-redelivery-submit');
  assert.deepEqual(f.calls[2].input,{password:'test-only-recovery-password',quoteId:'fixture-quote',reviewId:'fixture-review'});
  assert.equal(f.fields.password.value,'');f.render();
  assert.ok(nodes(f.tree).filter(n=>n.type==='button').every(n=>n.props.disabled));
  release();await turn();f.render();assert.equal(f.button('Confirm original'),undefined);
  await f.click('Check original');assert.equal(f.calls.at(-1).action,'payment-status');
});

test('expired review, cancellation, account changes and a busy wallet stop retry confirmation', async()=>{
  for(const mode of ['expired','cancel','logout','busy']){
    const f=fixture();await f.click('Open saved');await f.click('Review payment');
    f.fields.password.value='test-only-recovery-password';
    if(mode==='cancel'){f.button('Cancel delivery').props.onClick();f.render();assert.equal(f.button('Confirm original'),undefined);}
    else{
      if(mode==='expired')f.review.expiresAt=1;
      if(mode==='logout')f.logout();
      if(mode==='busy'){f.props.disabled=true;f.render();}
      f.button('Confirm original').props.onClick();await turn();
    }
    assert.equal(f.calls.length,2);
  }
});

test('saved history reopens without consent, and an existing hash offers only a status check', async()=>{
  const f=fixture();await f.click('Open saved');await f.click('Review payment');
  await f.click('Open saved');assert.equal(f.button('Confirm original'),undefined);
  f.row.hash='0x'+'22'.repeat(32);f.render();assert.equal(f.button('Review payment'),undefined);
  assert.ok(f.button('Check original'));
});


test('compatible recovery clearly requires new consent and preserves the reviewed original amount and fee', async()=>{
  const f=fixture('compatible-proof');await f.click('Open saved');await f.click('Review payment');
  assert.match(text(f.tree),/new compatible proof using both original private input notes/);
  assert.match(text(f.tree),/original attempt is preserved/);
  assert.equal(f.button('Confirm original'),undefined);
  assert.equal(f.calls.length,2);
  await f.click('Confirm compatible');
  assert.equal(f.calls.length,3);
  assert.deepEqual(f.calls[2].input,{password:'test-only-recovery-password',quoteId:'fixture-quote',reviewId:'fixture-review'});
  assert.equal(f.calls[2].expectedQuote,f.row.quote);
});
