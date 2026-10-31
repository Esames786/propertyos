import js from '@eslint/js';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const routerSeam = {
  paths: [
    { name: 'react-router', message: 'Shared UI and pages must not depend on the router. Use @repo/ui navigation hooks (ADR-0001 §2.3).' },
    { name: 'react-router-dom', message: 'Shared UI and pages must not depend on the router (ADR-0001 §2.3).' },
  ],
  patterns: [{ group: ['@repo/fixtures', '@repo/fixtures/*'], message: 'Pages and UI get data through props or the transport; fixtures belong to the prototype layer.' }],
};

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'docs/**', '**/*.generated.ts', 'test-results/**', 'test-results-*/**', 'playwright-report/**', 'tests/.*'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // React hook rules apply to React code only (Playwright fixtures also call a function named `use`).
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // No hard-coded English in rendered UI (blueprint 02: "no hard-coded English strings in components").
    files: ['packages/ui/src/**/*.tsx', 'apps/*/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { i18next },
    rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }] },
  },
  {
    files: ['packages/ui/src/**/*.{ts,tsx}', 'apps/*/src/pages/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', routerSeam] },
  },
);
