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
  },
});
