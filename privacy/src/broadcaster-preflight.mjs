import { fork } from 'node:child_process';
import { writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(import.meta.url);
const workerFlag = '--broadcaster-preflight-worker';
const messageType = 'honeybee-broadcaster-preflight';
const phases = new Set(['loading-client', 'discovering-broadcaster']);
const failures = new Set(['client-load-failed', 'discovery-failed']);
const base = { network: 'Ethereum_Sepolia', paymentReady: false };
const print = value => writeSync(1, JSON.stringify(value) + '\n');

// Public discovery only: no account, wallet, password or transaction. The parent
// reports immediately on a result, early exit or deadline; child cleanup and its
// close event must never be prerequisites for printing a diagnostic.
export function runBroadcasterPreflight({
  forkWorker = () => fork(entry, [workerFlag], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    execArgv: ['--dns-result-order=ipv4first'],
  }),
  timeoutMs = 95000,
  output = print,
} = {}) {
  output({ status: 'private-broadcaster-checking', ...base, timeoutSeconds: Math.ceil(timeoutMs / 1000) });
  return new Promise(resolveResult => {
    let child, timer, finished = false, stage = 'starting-worker';
    const unavailable = (reason, extra = {}) => ({ status: 'private-broadcaster-unavailable', ...base, stage, reason, ...extra });
    const finish = value => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // Write before shutdown. The isolated worker owns network sockets only;
      // terminating it cannot strand a wallet lease or interrupt a transaction.
      output(value);
      try { child?.kill('SIGKILL'); } catch { /* Worker may have already exited. */ }
      resolveResult(value);
    };
    timer = setTimeout(() => finish(unavailable('deadline-exceeded')), timeoutMs);
    try {
      child = forkWorker();
      child.on('message', value => {
        if (finished) return;
        if (value?.type !== messageType) return finish(unavailable('invalid-worker-result'));
        if (value.kind === 'phase' && phases.has(value.stage)) {
          stage = value.stage;
          return;
        }
        if (value.kind === 'result' && value.ready === true) {
          return finish({ status: 'private-broadcaster-ready', ...base, stage: 'broadcaster-discovered' });
        }
        if (value.kind === 'result' && value.ready === false && failures.has(value.reason)) {
          return finish(unavailable(value.reason));
        }
        finish(unavailable('invalid-worker-result'));
      });
      child.once('error', () => finish(unavailable('worker-start-failed')));
      const exited = (code, signal) => finish(unavailable('worker-exited-without-result', {
        exitCode: Number.isInteger(code) ? code : null,
        signal: ['SIGKILL', 'SIGTERM', 'SIGINT', 'SIGABRT', 'SIGSEGV'].includes(signal) ? signal : null,
      }));
      child.once('exit', exited);
      child.once('close', exited);
      child.once('disconnect', () => finish(unavailable('worker-disconnected-without-result')));
    } catch {
      finish(unavailable('worker-start-failed'));
    }
  });
}

async function runWorker() {
  if (typeof process.send !== 'function' || !process.connected) process.exit(1);
  const send = value => new Promise(resolveSent => {
    if (!process.connected) return resolveSent();
    process.send({ type: messageType, ...value }, () => resolveSent());
  });
  let stage = 'loading-client';
  try {
    await send({ kind: 'phase', stage });
    const { openPaymentBroadcaster } = await import('./payment-broadcaster.mjs');
    stage = 'discovering-broadcaster';
    await send({ kind: 'phase', stage });
    await openPaymentBroadcaster(() => {});
    // Report before SDK shutdown, which can itself stall. This disposable
    // process releases its network sockets when it exits.
    await send({ kind: 'result', ready: true });
    process.exit(0);
  } catch {
    await send({ kind: 'result', ready: false,
      reason: stage === 'loading-client' ? 'client-load-failed' : 'discovery-failed' });
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === entry) {
  // Only an explicit private argument selects the worker; an inherited IPC
  // channel alone must not divert the top-level CLI's stdout to another process.
  if (process.argv.includes(workerFlag)) await runWorker();
  else {
    const result = await runBroadcasterPreflight();
    process.exit(result.status === 'private-broadcaster-ready' ? 0 : 1);
  }
}
