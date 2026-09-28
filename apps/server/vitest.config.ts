import { defineConfig } from 'vitest/config';

// Server tests are pure TS — disable CSS/PostCSS pipeline so vitest never
// loads stray postcss configs from parent directories (e.g. ~/Desktop).
//
// H4 note: every test file shares one SQLite database (dev.db). SQLite
// serializes writers, so parallel test FILES cause cross-file lock contention
// — queries time out (P1008/"database failed to respond" timeouts) and
// timing-sensitive tests (auto-cashout server-derived multipliers) drift under
// the added latency. Failures rotate between runs depending on scheduling.
// fileParallelism:false runs test files one at a time so each file gets an
// uncontended DB. (Vitest 4: pool/poolOptions were removed; fileParallelism
// is the supported knob.)
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
