/**
 * Build of the server-side co-op host (`src/sim/worker.ts`) for Node: one self-contained ES module at
 * `server/sim/worker.mjs`, loaded by the room server as a worker thread per server-hosted session.
 */
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const version: string = JSON.parse(readFileSync('server/changelog.json', 'utf8')).versions[0]?.version ?? '0.0.0';

export default defineConfig({
  publicDir: false,
  define: { __DS_VERSION__: JSON.stringify(version) },
  build: {
    ssr: 'src/sim/worker.ts',
    outDir: 'server/sim',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: 'worker.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
