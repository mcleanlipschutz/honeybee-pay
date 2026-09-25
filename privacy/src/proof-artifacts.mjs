// Offline test artifacts only. These pins do not establish deployment identity
// or trusted-setup security. See SEGMENT-1E.md for provenance and limitations.
export const upstreamCommit = '6e2614d53a106dd62abad91e7ce03ee4a3956138';
export const artifactPrefix = 'artifacts-v2.1/01x02/';
export const artifactDirectory = new URL('../.honeybee/artifacts/', import.meta.url);
export const proofArtifacts = Object.freeze([
  Object.freeze({ name: 'wasm', file: 'wasm.br', bytes: 3007613,
    gitBlob: '786a177834c8748a1178bb4b309dc927e1cf4b6e',
    sha256: '6ce87ddb4e33cff9564338a8b1f58047b22809e5d198f243c777d1aa4eaaa1e3' }),
  Object.freeze({ name: 'zkey', file: 'zkey.br', bytes: 6121318,
    gitBlob: 'd423c8b32b8c1b16def6fb4886b7cc796eaae447',
    sha256: '8ef8e7abcfb5e60fb593d4d961657465f498435a0835adef05acc09534d7557b' }),
  Object.freeze({ name: 'vkey.json', file: 'vkey.json', bytes: 3256,
    gitBlob: 'cc2fa5a3e8ff9d86691a583c6bd086ed178a894d',
    sha256: '9369fa6ad3d7a1becf4b10cf4bd6a7eb83725cfb5cf75a08b191c5bc2cd479f4' }),
]);
export const artifactManifest = Object.freeze(Object.fromEntries(
  proofArtifacts.map(a => [artifactPrefix + a.name, a.sha256]),
));
