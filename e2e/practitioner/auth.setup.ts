import { test as setup, expect } from '@playwright/test'

/**
 * Fills the gap practitioner-access.spec.ts left open: "Covering the practitioner UI
 * properly needs an authenticated browser context ... needs a dedicated test
 * practitioner account — noted, not faked here."
 *
 * Runs against the LOCAL Supabase stack only (see .env.development.local in this
 * worktree) — never production. Creates a fixed test practitioner via the Supabase
 * Admin Auth API (idempotent: a 422 "already registered" means it already exists,
 * which is fine), then logs in through the real /login form and saves the resulting
 * session as storageState for every other spec in this project to reuse.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321'
// The Supabase CLI's fixed local-dev service role key — identical on every machine that
// runs `npx supabase start`, publicly documented, not a secret (see .env.test's own
// comment on the same value). Hardcoded rather than read from env because this file runs
// under the Playwright test runner's own process, which never loads Next.js's
// .env.development.local.
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_EMAIL = 'e2e-practitioner@local.test'
const TEST_PASSWORD = 'E2eTestPass123!'

async function ensureTestPractitionerExists() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  })
  if (res.status === 422 || res.status === 200 || res.status === 201) return
  const body = await res.text()
  throw new Error(`Failed to provision test practitioner: ${res.status} ${body}`)
}

setup('authenticate as the e2e test practitioner', async ({ page }) => {
  await ensureTestPractitionerExists()

  await page.goto('/login')
  await page.getByPlaceholder('your@email.com').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.click('button:has-text("Sign in")')

  // Login itself navigates to '/' (login/page.tsx: `window.location.href = '/'`), and
  // proxy.ts rewrites '/' to the client app for every visitor regardless of auth state
  // (its very first check, before the login gate) — so a successful login does not land
  // on /practitioner by itself. Confirm the session actually took by visiting it directly.
  await expect(page).toHaveURL('http://localhost:3100/', { timeout: 15000 })
  await page.goto('/practitioner')
  await expect(page).toHaveURL(/\/practitioner/, { timeout: 15000 })
  await page.context().storageState({ path: 'e2e/practitioner/.auth/practitioner.json' })
})
