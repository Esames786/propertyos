import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/tokens/src/**/*.test.ts',
            'packages/i18n/src/**/*.test.ts',
            'packages/contracts/src/**/*.test.ts',
            'packages/fixtures/src/**/*.test.ts',
            'packages/ui/src/**/*.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          testTimeout: 20000,
          include: ['packages/ui/src/**/*.test.tsx'],
          setupFiles: ['packages/ui/src/test/setup.ts'],
        },
      },
    ],
  },
});
