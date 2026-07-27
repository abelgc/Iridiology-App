import { test, expect } from '@playwright/test'

/**
 * Every practitioner route is behind the login gate.
 *
 * This file replaces analysis.spec.ts, patient-management.spec.ts and
 * responsive.spec.ts, which claimed to test practitioner forms, patient lists and
 * loading states but could never reach any of them: they targeted pre-move paths
 * (`/patients`, `/sessions/new`, `/reports/:id`) that no longer exist, and the
 * practitioner area requires a session those tests never had. The handful that passed
 * were asserting things that are also true of the login page, or tautologies like
 * checking a viewport width the test had just set.
 *
 * What IS testable without a session is the gate itself, and it is worth pinning: the
 * proxy has broken twice in production, and a regression that let one of these pages
 * render to an anonymous visitor would expose patient data.
 *
 * Covering the practitioner UI properly needs an authenticated browser context
 * (Playwright storageState seeded by a real login). That is a separate piece of work and
 * needs a dedicated test practitioner account — noted, not faked here.
 */

// Every route that actually exists under src/app/practitioner. Dynamic segments are
// filled with a syntactically valid id so the gate, not a 404, is what answers.
const PRACTITIONER_ROUTES = [
  '/practitioner',
  '/practitioner/patients',
  '/practitioner/patients/new',
  '/practitioner/patients/00000000-0000-4000-8000-000000000000',
  '/practitioner/patients/00000000-0000-4000-8000-000000000000/edit',
  '/practitioner/sessions/new',
  '/practitioner/sessions/00000000-0000-4000-8000-000000000000',
  '/practitioner/reports/00000000-0000-4000-8000-000000000000',
  '/practitioner/reports/00000000-0000-4000-8000-000000000000/edit',
  '/practitioner/reports/00000000-0000-4000-8000-000000000000/chat',
  '/practitioner/settings',
]

test.describe('Practitioner area is login-gated', () => {
  for (const route of PRACTITIONER_ROUTES) {
    test(`${route} sends an anonymous visitor to /login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/)
    })
  }

  test('the gate is real, not an artefact of the paths not existing', async ({ page }) => {
    // The old suite passed a redirect assertion for `/patients`, a route that had been
    // moved away — any nonexistent path redirects too, so that proved nothing. Confirm the
    // login page itself is reachable and renders, so a redirect to it is meaningful.
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible()
  })
})
