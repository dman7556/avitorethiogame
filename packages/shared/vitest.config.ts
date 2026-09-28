import { defineConfig } from 'vitest/config';

// Same guard as apps/server/vitest.config.ts: pure-TS tests must never load
// a stray postcss config from parent directories (~/Desktop/postcss.config.mjs
// references @tailwindcss/postcss, which this workspace does not install).
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
