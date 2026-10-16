import { rmSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // three-vrm imports three too: one copy for everyone
  resolve: { dedupe: ['three'] },
  // the local stand-in VRoid model (public/anime/test, git-ignored) is for development only: never ship it
  plugins: [{ name: 'drop-anime-test', apply: 'build', closeBundle: () => rmSync('dist/anime/test', { recursive: true, force: true }) }],
  // Separate dependency-optimiser caches let several dev servers run side by side (VITE_CACHE_DIR=node_modules/.vite-name).
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    // the game, and the bestiary (every infected in 3D)
    rollupOptions: { input: { main: 'index.html', bestiary: 'bestiary.html' } },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    hmr: process.env.VITE_NO_HMR === '1' ? false : undefined,
    // the game server (pnpm server), when it is running; without it the game plays as a local, signed-out build
    proxy: { '/api': 'http://127.0.0.1:3061', '/auth': 'http://127.0.0.1:3061', '/admin': 'http://127.0.0.1:3061', '/ws': { target: 'ws://127.0.0.1:3061', ws: true } },
  },
  preview: { host: '127.0.0.1', port: 4173 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
