import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';

// Exercise the actual JSX handlers with explicit hook/form doubles. This is
// not a browser test and never loads a wallet, signs, proves, or broadcasts.
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
export default {createElement:(type,props,...children) => ({type,props:props||{},children})};
`);
const hooks = await import(hooksURL);
const source = await readFile(new URL('../src/PrivatePaymentForm.jsx', import.meta.url), 'utf8');
let { code } = await transformWithOxc(source, 'PrivatePaymentForm.jsx', { jsx: { runtime: 'classic' } });
for (const [specifier, replacement] of [
  ['react', hooksURL], ['viem', import.meta.resolve('viem')],
  ['../../shared/test-assets.mjs', new URL('../../shared/test-assets.mjs', import.meta.url).href],
]) code = code.replaceAll(JSON.stringify(specifier), JSON.stringify(replacement));
const { PrivatePaymentForm } = await import(moduleURL(`import {FormData} from ${JSON.stringify(hooksURL)};\n${code}`));
const nodes = value => Array.isArray(value) ? value.flatMap(nodes)
  : value && typeof value === 'object' && value.type ? [value, ...nodes(value.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('')
  : value && typeof value === 'object' ? text(value.children) : value == null || value === false ? '' : String(value);

function fixture() {
  const frame = {slots:[],cursor:0}, calls = [];
  let current = true, response, hold;
  const fields = {password:{value:'test-only-recovery-password'},fee:{value:'0.004'}};
  const form = {fields, elements:{namedItem:key=>fields[key]}, reportValidity:()=>fields.password.value.length >= 16 && !!fields.fee.value};
  const request = {amountUnits:'1000000',expiresAt:Math.floor(Date.now()/1000)+3600};
  const props = {request,wallet:{id:'fixture'},disabled:false,isCurrent:()=>current,
    transact:async(action,input,wallet,quote)=>{
      calls.push({action,input,wallet,quote});
      if (hold) await hold;
      response = action === 'payment-quote'
        ? {status:'quoted',hash:null,quote:{quoteId:'fixture-quote',request,maxFeeUnits:input.maxFeeUnits,feeUnits:'3000000000000000',totalUnits:'1000000',expiresAt:Date.now()+600000}}
        : {...response,status:'pending',hash:'0x'+'11'.repeat(32)};
      return {privatePayment:response};
    }};
  let tree;
  const render=()=>{hooks.begin(frame);tree=PrivatePaymentForm(props);nodes(tree).find(node=>node.type==='form').props.ref.current=form;return tree;};
  const button=label=>nodes(tree).find(node=>node.type==='button'&&text(node).startsWith(label));
  render();
  return {calls,fields,props,button,render,frame,get tree(){return tree;},get response(){return response;},
    hold:value=>{hold=value;},logout:()=>{current=false;},
    async quote(){button('Check total and fee').props.onClick();await turn();render();},
    enter(){let prevented=false;nodes(tree).find(node=>node.type==='form').props.onKeyDown({key:'Enter',target:{tagName:'INPUT'},preventDefault:()=>{prevented=true;}});return prevented;}};
}

test('quote click only quotes, clears the password, preserves the fee limit and explains confirmation', async()=>{
  const f=fixture();await f.quote();
  assert.deepEqual(f.calls.map(call=>call.action),['payment-quote']);
  assert.equal(f.calls[0].input.maxFeeUnits,'4000000000000000');
  assert.equal(f.fields.password.value,'');assert.equal(f.fields.fee.value,'0.004');
  assert.match(text(f.tree),/Quote ready\. Re-enter your recovery password/);
  assert.equal(f.button('Confirm private payment').props.type,'button');
});

test('Enter preserves a reviewed quote; the explicit confirmation click submits its exact ID once', async()=>{
  const f=fixture();await f.quote();f.fields.password.value='test-only-recovery-password';
  assert.equal(f.enter(),true);await turn();f.render();
  assert.equal(f.calls.length,1);assert.notEqual(f.fields.password.value,'');
  assert.match(text(f.tree),/Click Confirm private payment to authorize/);
  let release;f.hold(new Promise(resolve=>{release=resolve;}));
  const confirm=f.button('Confirm private payment');confirm.props.onClick();confirm.props.onClick();
  assert.deepEqual(f.calls.map(call=>call.action),['payment-quote','payment-submit']);
  assert.deepEqual(f.calls[1].input,{password:'test-only-recovery-password',quoteId:'fixture-quote'});
  assert.equal(f.calls[1].quote,f.response.quote);assert.equal(f.fields.password.value,'');
  f.render();assert.equal(f.button('Confirm private payment').props.disabled,true);
  release();await turn();f.render();
  assert.equal(f.button('Confirm private payment'),undefined);
  f.fields.password.value='test-only-recovery-password';f.button('Check original payment').props.onClick();await turn();
  assert.deepEqual(f.calls.map(call=>call.action),['payment-quote','payment-submit','payment-status']);
});

test('blank password, changed fee limit and expired quote cannot start confirmation', async()=>{
  const f=fixture();await f.quote();
  f.button('Confirm private payment').props.onClick();await turn();assert.equal(f.calls.length,1);
  f.fields.password.value='test-only-recovery-password';f.fields.fee.value='0.005';
  f.button('Confirm private payment').props.onClick();await turn();f.render();
  assert.equal(f.calls.length,1);assert.match(text(f.tree),/fee limit changed/);
  f.fields.password.value='test-only-recovery-password';f.fields.fee.value='0.004';
  f.response.quote.expiresAt=Date.now()-1;
  f.button('Confirm private payment').props.onClick();await turn();f.render();
  assert.equal(f.calls.length,1);assert.match(text(f.tree),/expired or was already attempted/);
});

test('logout and an externally busy wallet stop confirmation before reading or clearing the password', async()=>{
  const f=fixture();await f.quote();f.fields.password.value='test-only-recovery-password';
  f.props.disabled=true;f.render();f.button('Confirm private payment').props.onClick();
  f.props.disabled=false;f.render();f.logout();f.button('Confirm private payment').props.onClick();await turn();
  assert.equal(f.calls.length,1);assert.equal(f.fields.password.value,'test-only-recovery-password');
});
