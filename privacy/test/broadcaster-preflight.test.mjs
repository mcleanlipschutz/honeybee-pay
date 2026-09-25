import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { fork } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBroadcasterPreflight } from '../src/broadcaster-preflight.mjs';

const type = 'honeybee-broadcaster-preflight';
function fixture() {
  const child = new EventEmitter();
  child.kills = 0;
  child.kill = () => { child.kills++; return true; };
  return child;
}
function start(child, timeoutMs = 1000) {
  const lines = [];
  const promise = runBroadcasterPreflight({ forkWorker: () => child, timeoutMs, output: value => lines.push(value) });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].status, 'private-broadcaster-checking');
  return { lines, promise };
}

test('diagnostic reports discovery immediately even if the worker never emits close', async () => {
  const child = fixture(), { lines, promise } = start(child);
  child.emit('message', { type, kind: 'phase', stage: 'discovering-broadcaster' });
  child.emit('message', { type, kind: 'result', ready: true, secret: 'synthetic-untrusted-detail' });
  const result = await promise;
  assert.deepEqual(result, { status: 'private-broadcaster-ready', network: 'Ethereum_Sepolia', paymentReady: false, stage: 'broadcaster-discovered' });
  child.emit('exit', 1, null); child.emit('close', 1, null); child.emit('disconnect');
  assert.equal(lines.length, 2); assert.equal(child.kills, 1);
  assert.ok(!JSON.stringify(lines).includes('synthetic-untrusted-detail'));
});

test('a successful process exit without a discovery result is still unavailable', async () => {
  for (const event of ['exit', 'close', 'disconnect']) {
    const child = fixture(), { lines, promise } = start(child);
    child.emit(event, 0, null);
    const result = await promise;
    assert.equal(result.status, 'private-broadcaster-unavailable');
    assert.match(result.reason, /without-result$/);
    assert.equal(lines.length, 2); assert.equal(child.kills, 1);
  }
});

test('deadline prints its own failure without depending on worker exit or close', async () => {
  const child = fixture(), { lines, promise } = start(child, 25);
  child.emit('message', { type, kind: 'phase', stage: 'loading-client' });
  const result = await promise;
  assert.equal(result.reason, 'deadline-exceeded');
  assert.equal(result.stage, 'loading-client');
  assert.equal(lines.length, 2); assert.equal(child.kills, 1);
  child.emit('message', { type, kind: 'result', ready: true });
  assert.equal(lines.length, 2);
});

test('health counters survive a worker timeout without exposing extra fields or claiming discovery', async () => {
  const child = fixture(), { lines, promise } = start(child, 25);
  child.emit('message', { type, kind: 'diagnostic', diagnostic: {
    sampled: true, maxDiscoveredPeers: 3, maxConnectedPeers: 1,
    lastEvent: 'subscribing', lastFailure: 'subscription-failed',
    secret: 'synthetic-private-path', paymentReady: true,
  } });
  const result = await promise;
  assert.equal(result.reason, 'deadline-exceeded'); assert.equal(result.paymentReady, false);
  assert.equal(result.diagnostic.maxConnectedPeers, 1);
  assert.equal(result.diagnostic.lastFailure, 'subscription-failed');
  assert.ok(!JSON.stringify(lines).includes('synthetic-private-path'));
  assert.equal(lines.length, 2);
});

test('alternative fee-token evidence survives deadline but cannot make the requested token ready', async () => {
  const child = fixture(), { lines, promise } = start(child, 25);
  const token = '0x7b79995e5f793a07bc00c21412e50ecae098e7f9';
  child.emit('message', { type, kind: 'diagnostic', diagnostic: {
    maxEligibleSepoliaOffers: 10, maxEligibleRequestedTokenOffers: 0,
    observedFeeTokenAddresses: [token, 'synthetic-private-string'],
    paymentReady: true, feeTokenStatus: 'ready',
  } });
  const result = await promise;
  assert.equal(result.status, 'private-broadcaster-unavailable');
  assert.equal(result.reason, 'deadline-exceeded');
  assert.equal(result.paymentReady, false);
  assert.equal(result.diagnostic.feeTokenStatus, 'other-token-offers-only');
  assert.deepEqual(result.diagnostic.observedFeeTokenAddresses, [token]);
  assert.ok(!JSON.stringify(lines).includes('synthetic-private-string'));
});

test('spawn errors, malformed messages and worker failures produce fixed sanitized output', async () => {
  const lines = [];
  const failure = await runBroadcasterPreflight({ output: value => lines.push(value),
    forkWorker: () => { throw new Error('synthetic-private-path'); } });
  assert.equal(failure.reason, 'worker-start-failed');
  assert.ok(!JSON.stringify(lines).includes('synthetic-private-path'));
  for (const message of [{ ready: true }, { type, kind: 'phase', stage: 'synthetic-private-path' },
    { type, kind: 'result', ready: false, reason: 'synthetic-private-path' }]) {
    const child = fixture(), run = start(child);
    child.emit('message', message);
    assert.equal((await run.promise).reason, 'invalid-worker-result');
    assert.ok(!JSON.stringify(run.lines).includes('synthetic-private-path'));
  }
  const child = fixture(), run = start(child);
  child.emit('message', { type, kind: 'phase', stage: 'discovering-broadcaster' });
  child.emit('message', { type, kind: 'result', ready: false, reason: 'discovery-failed' });
  assert.equal((await run.promise).reason, 'discovery-failed');
});

test('real subprocess discovery messages survive early exit and a silent worker cannot pass', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'honeybee-broadcaster-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, 'worker.mjs');
  await writeFile(script, `
if (process.argv[2] === 'ready') {
  process.send({ type: '${type}', kind: 'result', ready: true }, () => process.exit(0));
} else process.exit(0);
`);
  for (const mode of ['ready', 'silent']) {
    let closed;
    const lines = [];
    const result = await runBroadcasterPreflight({ timeoutMs: 5000, output: value => lines.push(value), forkWorker: () => {
      const child = fork(script, [mode], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
      closed = once(child, 'close'); return child;
    } });
    await closed;
    assert.equal(result.status, mode === 'ready' ? 'private-broadcaster-ready' : 'private-broadcaster-unavailable');
    assert.equal(lines.length, 2);
  }
});
