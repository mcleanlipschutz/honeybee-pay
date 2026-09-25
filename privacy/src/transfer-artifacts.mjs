import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPinnedArtifactStore } from './artifact-store.mjs';
import { artifactDirectory, artifactManifest } from './proof-artifacts.mjs';

// WASM/zkey hashes match Wallet SDK 10.9.0's integrity manifest. Both vkeys
// were independently derived from those pinned zkeys and compared field-for-
// field, including every IC point, before pinning their downloaded encodings.
const transferCID = 'QmUsmnK4PFc7zDp2cmC4wBZxYLjNyRgWfs5GNcJJ2uLcpU';
const poiCID = 'QmZrP9zaZw2LwErT2yA6VpMWm65UdToQiKj4DtStVsUJHr';
export const transferArtifacts = Object.freeze([
  ['01x03', 'wasm', 3918931, '72e55865fccca077f443bae9f1e6762a156ea478a137efc1324fb79153050276'],
  ['01x03', 'zkey', 6361742, '477aeca6a8ed3706f572bce0e99a7054e700a4e3c2ee4499d7013a4d7770e0d0'],
  ['01x03', 'vkey.json', 3420, '649561f264ee8dc6cfbf78a989d2978d848f6a5c730bb1817659edfa54266130'],
  ['POI_3x3', 'wasm', 4520908, '831aad53c05d19f9854ed27429610da724fbdf9e1e7023aa7a90666f50b0da78'],
  ['POI_3x3', 'zkey', 13605800, '667984c51df2122956107c11c3c606e4e4688f70fb25515b9388cbd5140e48b3'],
  ['POI_3x3', 'vkey.json', 4207, '2f4dcbf58d383204e09240863a6f6eff249071849e5161801ebfe83691037b23'],
].map(([variant, name, bytes, sha256]) => {
  const poi = variant.startsWith('POI');
  const logical = `artifacts-v2.1/${poi ? 'poi-nov-2-23/' : ''}${variant}/${name}`;
  const path = poi ? `${variant}/${name === 'vkey.json' ? name : name + '.br'}`
    : name === 'wasm' ? `prover/snarkjs/${variant}.wasm.br`
    : `circuits/${variant}/${name === 'vkey.json' ? name : name + '.br'}`;
  return Object.freeze({ variant, name, bytes, sha256, logical, url: `https://ipfs-lb.com/ipfs/${poi ? poiCID : transferCID}/${path}` });
}));
export const transferManifest = Object.freeze({ ...artifactManifest,
  ...Object.fromEntries(transferArtifacts.map(a => [a.logical, a.sha256])) });
export const createTransferArtifactStore = () => createPinnedArtifactStore(fileURLToPath(artifactDirectory), transferManifest);

export async function prepareTransferArtifacts() {
  const store = await createTransferArtifactStore();
  for (const a of transferArtifacts) {
    if (await store.exists(a.logical)) continue;
    const response = await fetch(a.url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
    if (!response.ok || !response.body) throw new Error('Transfer artifact unavailable');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) throw new Error('Transfer artifact exceeds download limit');
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks), data = a.name === 'vkey.json' ? raw
      : brotliDecompressSync(raw, { maxOutputLength: a.bytes });
    if (data.length !== a.bytes || createHash('sha256').update(data).digest('hex') !== a.sha256) {
      throw new Error('Transfer artifact integrity mismatch');
    }
    await store.store('', a.logical, data);
  }
  return { status: 'pinned-transfer-artifacts-ready', artifacts: transferArtifacts.length,
    circuits: ['01x03', 'POI_3x3'], paymentReady: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await prepareTransferArtifacts())); }
  catch { console.error('Transfer artifacts could not be prepared. No wallet was opened.'); process.exitCode = 1; }
}
