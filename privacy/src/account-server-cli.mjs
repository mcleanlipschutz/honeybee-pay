import { mkdir, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAccountServer } from './account-server.mjs';

try {
  const appId = process.env.HONEYBEE_PRIVY_APP_ID;
  const keyFile = process.env.HONEYBEE_PRIVY_VERIFICATION_KEY_FILE;
  if (!appId || !keyFile) throw new Error();
  const verificationKey = await readFile(resolve(keyFile), 'utf8');
  const path = resolve(process.env.HONEYBEE_ACCOUNT_DIRECTORY || '.honeybee/accounts');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const server = await startAccountServer({ directory: await realpath(path), appId, verificationKey,
    distDirectory: fileURLToPath(new URL('../../checkout/dist/', import.meta.url)),
    port: Number(process.env.HONEYBEE_ACCOUNT_PORT || 4173) });
  console.log(`Honeybee local testnet demo: ${server.origin}`);
  console.log('KYC deferred. Local runtime handles test-wallet keys. Private payments are not enabled.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
} catch {
  console.error('Local demo could not start. Check the Privy public configuration, private storage directory, port and checkout build.');
  process.exitCode = 1;
}
