import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
// oxlint-disable-next-line import/no-default-export
export default defineConfig({
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['scripts/**/*.ts'],
      exclude: [
        'scripts/**/__tests__/**',
        'scripts/**/*.test.ts',
        // Test setup rather than code under test.
        'scripts/oxlint/utils/testing.ts',
        // These only start the commands in scripts/cli.
        'scripts/build.ts',
        'scripts/with-saves.ts',
      ],
      reporter: [['text', { skipFull: false }], 'html'],
      // Every line and branch has to be exercised by a test.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
