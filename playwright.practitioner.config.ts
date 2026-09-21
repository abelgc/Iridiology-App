import { defineConfig, devices } from '@playwright/test'

// Separate from playwright.config.ts on purpose: that one's webServer reuses whatever is
// already on :3000, which in normal dev is the practitioner's own server pointed at
// PRODUCTION Supabase (.env.local). These specs create real patients/sessions and must
// only ever run against the local Docker Supabase stack (.env.development.local in this
// worktree) — a dedicated port and `reuseExistingServer: false` make that impossible to
// get wrong by accident.
export default defineConfig({
  testDir: './e2e/practitioner',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'practitioner-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/practitioner/.auth/practitioner.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npx next dev --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
