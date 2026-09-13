import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPinnedArtifactStore } from './artifact-store.mjs';
import { artifactDirectory, artifactManifest, artifactPrefix, proofArtifacts,
  upstreamCommit } from './proof-artifacts.mjs';

export function decodeArtifact(download, artifact) {
  const gitBlob = createHash('sha1').update(`blob ${download.length}\0`).update(download).digest('hex');
  if (gitBlob !== artifact.gitBlob) throw new Error('Upstream artifact blob mismatch');
  const data = artifact.file.endsWith('.br')
    ? brotliDecompressSync(download, { maxOutputLength: artifact.bytes }) : download;
  if (data.length !== artifact.bytes
      || createHash('sha256').update(data).digest('hex') !== artifact.sha256) {
    throw new Error('Decoded artifact integrity mismatch');
  }
  return data;
}

async function downloadArtifact(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) throw new Error('Artifact download failed');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024) throw new Error('Artifact download exceeds limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function prepareProofArtifacts(directory = fileURLToPath(artifactDirectory)) {
  const store = await createPinnedArtifactStore(directory, artifactManifest);
  for (const artifact of proofArtifacts) {
    const name = artifactPrefix + artifact.name;
    if (await store.exists(name)) continue;
    const url = `https://raw.githubusercontent.com/Railgun-Community/engine/${upstreamCommit}/src/test/test-artifacts-lite/1x2/${artifact.file}`;
    const data = decodeArtifact(await downloadArtifact(url), artifact);
    await store.store('', name, data);
  }
  return { status: 'pinned-test-artifacts-ready', artifacts: 3, paymentReady: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await prepareProofArtifacts())); }
  catch { console.error('Proof artifact preparation failed. Check network access and pinned artifact integrity.'); process.exitCode = 1; }
}
