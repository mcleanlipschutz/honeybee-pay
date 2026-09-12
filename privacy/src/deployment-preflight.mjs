import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPinnedArtifactStore } from './artifact-store.mjs';
import { artifactDirectory, artifactManifest, artifactPrefix } from './proof-artifacts.mjs';
import { makeReadOnlyRpc } from './network-preflight.mjs';
import { inspectDeployment } from './deployment-check.mjs';

try {
  if (!process.env.HONEYBEE_RPC_URL || !process.env.HONEYBEE_NETWORK) throw new Error('Network configuration is required');
  const pins = JSON.parse(await readFile(new URL('../config/sepolia-deployment.json', import.meta.url), 'utf8'));
  const store = await createPinnedArtifactStore(fileURLToPath(artifactDirectory), artifactManifest);
  const data = await store.get(artifactPrefix + 'vkey.json');
  if (!data) throw new Error('Prepare proof artifacts first');
  console.log(JSON.stringify(await inspectDeployment(process.env.HONEYBEE_NETWORK,
    makeReadOnlyRpc(process.env.HONEYBEE_RPC_URL), pins, JSON.parse(data))));
} catch {
  // Never print provider URLs or error payloads that could contain credentials.
  console.error('Deployment preflight failed. Check the RPC, pinned deployment, chain and circuit key.');
  process.exitCode = 1;
}
