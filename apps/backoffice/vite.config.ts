import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Gate E.3 local validation (Issue #33): test-only principals (`@repo/fixtures/testing`) are compiled in
  // only when Playwright builds the app with PROPERTYOS_E2E_PRINCIPALS=1. Every other build, the shipped demo
  // included, gets the literal `false`, so the bundler drops them. Provisional; reconcile at integration.
  define: { __E2E_TEST_PRINCIPALS__: JSON.stringify(process.env.PROPERTYOS_E2E_PRINCIPALS === '1') },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { sourcemap: true, target: 'es2022' },
});
