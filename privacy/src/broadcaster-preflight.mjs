import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Public network discovery only: no account, wallet, password or transaction.
if (process.send) {
  try {
    const { openPaymentBroadcaster } = await import('./payment-broadcaster.mjs');
    const connection = await openPaymentBroadcaster(() => {});
    await connection.close();
    process.send({ status: 'private-broadcaster-ready', network: 'Ethereum_Sepolia', paymentReady: false }, () => process.exit(0));
  } catch {
    process.send({ status: 'private-broadcaster-unavailable', network: 'Ethereum_Sepolia', paymentReady: false }, () => process.exit(1));
  }
} else {
  const child = fork(fileURLToPath(import.meta.url), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: ['--dns-result-order=ipv4first'] });
  let result;
  const timer = setTimeout(() => child.kill('SIGKILL'), 95000);
  child.on('message', value => { result = value; });
  child.once('error', () => {});
  child.once('close', code => {
    clearTimeout(timer);
    console.log(JSON.stringify(code === 0 && result?.status === 'private-broadcaster-ready' ? result
      : { status: 'private-broadcaster-unavailable', network: 'Ethereum_Sepolia', paymentReady: false }));
    process.exitCode = code === 0 ? 0 : 1;
  });
}
