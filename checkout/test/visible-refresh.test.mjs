import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { startVisibleRefresh } from '../src/visible-refresh.mjs';

function fixture() {
  const page = new EventTarget(); page.hidden = false;
  const host = new EventTarget();
  let id = 0;
  const timers = new Map();
  const clock = { setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key) };
  return { page, host, clock, timers, async next() { const fn = timers.values().next().value; assert.ok(fn); timers.clear(); await fn(); } };
}

test('refreshes never overlap when focus and visibility events arrive during a slow read', async () => {
  const f = fixture(); let calls = 0; let release;
  const stop = startVisibleRefresh(async () => { calls++; await new Promise(r => { release = r; }); }, f);
  f.host.dispatchEvent(new Event('focus'));
  f.page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1);
  assert.equal(f.timers.size, 0);
  release(); await tick();
  assert.equal(f.timers.size, 1);
  stop(); assert.equal(f.timers.size, 0);
});

test('hidden tabs pause, foreground resumes, and transient read failures retry', async () => {
  const f = fixture(); f.page.hidden = true; let calls = 0;
  const stop = startVisibleRefresh(async () => { calls++; throw Error('RPC offline'); }, f);
  assert.equal(calls, 0);
  f.page.hidden = false; f.page.dispatchEvent(new Event('visibilitychange')); await tick();
  assert.equal(calls, 1);
  await f.next(); assert.equal(calls, 2);
  f.page.hidden = true; f.page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.timers.size, 0);
  stop();
});

test('cleanup invalidates a late result and removes foreground listeners', async () => {
  const f = fixture(); let calls = 0; let applied = 0; let release;
  const stop = startVisibleRefresh(async signal => { calls++; await new Promise(r => { release = r; }); if (!signal.aborted) applied++; }, f);
  stop(); release(); await tick();
  f.host.dispatchEvent(new Event('focus'));
  f.page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1); assert.equal(applied, 0); assert.equal(f.timers.size, 0);
});

test('a terminal payment result ends automatic checks permanently', async () => {
  const f = fixture(); let calls = 0;
  startVisibleRefresh(async () => { calls++; return false; }, f);
  await tick();
  f.host.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1); assert.equal(f.timers.size, 0);
});
