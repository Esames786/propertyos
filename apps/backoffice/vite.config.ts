import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Gate E.3 (Wave 2 integration): the test-only pricing principals (`@repo/fixtures/testing`) exist only in
// Playwright's build (PROPERTYOS_E2E_PRINCIPALS=1): there `./prototype/build-personas` (an empty list) resolves
// to `build-personas.e2e.ts` instead. Every other build, the shipped demo included, never imports them, so
// neither its files nor its sourcemaps name them (scripts/check-test-principals.mjs proves it).
const TEST_PRINCIPALS = process.env.PROPERTYOS_E2E_PRINCIPALS === '1';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: TEST_PRINCIPALS
      ? [{ find: /^\.\/prototype\/build-personas$/, replacement: fileURLToPath(new URL('./src/prototype/build-personas.e2e.ts', import.meta.url)) }]
      : [],
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { sourcemap: true, target: 'es2022' },
});
