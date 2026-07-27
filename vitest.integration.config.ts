import { defineConfig } from 'vitest/config'
import path from 'path'

// Integration tests run against a REAL Postgres (the local Supabase stack), not a mock.
// They are deliberately kept out of `npm test` — the unit suite must never need Docker.
//   npm test      -> vitest.config.ts       (jsdom, mocks, no Docker)
//   npm run test:int -> this file           (node, real Postgres, Docker required)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__integration__/**/*.test.ts'],
    setupFiles: ['./src/test/integration-setup.ts'],
    globals: true,

    // Single-threaded, and not by preference: sweepStaleAnalyses() scans the WHOLE
    // client_analyses table with no per-test scoping, so two test files running at once
    // would sweep each other's fixtures and produce failures that depend on scheduling.
    // One fork, one file at a time, one test at a time.
    pool: 'forks',
    maxWorkers: 1,
    // No `minWorkers`: it is not a valid option in this Vitest version, and `maxWorkers: 1`
    // with `fileParallelism: false` already pins the run to a single fork.
    fileParallelism: false,
    sequence: { concurrent: false },

    // A real database is slower than a mock, and the concurrency tests deliberately fire
    // two callers at once and wait for both.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
