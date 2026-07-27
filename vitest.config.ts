import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Integration tests live in src/**/__integration__/ and need a real Postgres (Docker).
    // This config has no `include`, so the default glob would otherwise sweep them into
    // `npm test` and fail on every machine without the local Supabase stack running.
    // They have their own runner: `npm run test:int` (vitest.integration.config.ts).
    exclude: ['node_modules', 'dist', 'e2e', '.claude/worktrees/**', '**/__integration__/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
