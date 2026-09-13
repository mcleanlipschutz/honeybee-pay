import { build } from 'vite';
import { mkdir, copyFile, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await build({ build: { outDir: 'dist/client', emptyOutDir: true } });
await build({
  build: { ssr: 'server/index.mjs', outDir: 'dist/server', emptyOutDir: true, target: 'es2022',
    rolldownOptions: { output: { entryFileNames: 'index.js' } } },
  ssr: { target: 'webworker', noExternal: true },
});
await mkdir('dist/.openai', { recursive: true });
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
