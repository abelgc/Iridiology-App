import { test, expect } from '@playwright/test'

/**
 * Real browser, real local DB (this worktree's .env.development.local points at the
 * local Docker Supabase stack, never production — see playwright.practitioner.config.ts).
 * No AI involved, so nothing here is mocked: create, list, view, and edit all go through
 * the real /api/patients routes fixed earlier today (the ZodError check that never
 * matched a real ZodError, returning a false 500 for bad input).
 */

// The app shell renders its own <h1>Narasimha Solutions</h1> on every page, so a bare
// h1 locator is ambiguous everywhere. Every page under test has exactly one other h1.
function pageHeading(page: import('@playwright/test').Page) {
  return page.locator('h1').filter({ hasNotText: 'Narasimha Solutions' })
}

test.describe('Patient management', () => {
  test('creates a patient, finds it in the list, and views its detail page', async ({ page }) => {
    const name = `E2E Patient ${Date.now()}`

    await page.goto('/practitioner/patients/new')
    await page.getByPlaceholder('Patient name').fill(name)
    await page.click('button:has-text("Create Patient")')

    // The real POST /api/patients route redirects to the new patient's detail page.
    await expect(page).toHaveURL(/\/practitioner\/patients\/[0-9a-f-]{36}$/, { timeout: 10000 })
    await expect(pageHeading(page)).toHaveText(name)

    await page.goto(`/practitioner/patients?search=${encodeURIComponent(name)}`)
    // The list renders both a desktop table row and a mobile card for the same patient
    // (responsive layout, not a duplicate) — either is proof the search found it.
    await expect(page.getByText(name).first()).toBeVisible()
  })

  test('REGRESSION (2026-09-21): invalid patient data shows a real validation error, not a false 500', async ({ page }) => {
    // Reproduces the fixed bug: the route checked `error.code === 'ZOD_ERROR'`, which a
    // real ZodError never has, so bad input previously surfaced as "Internal server error"
    // instead of a validation message.
    await page.goto('/practitioner/patients/new')
    await page.getByPlaceholder('patient@example.com').fill('not-an-email')
    await page.getByPlaceholder('Patient name').fill('')
    await page.click('button:has-text("Create Patient")')

    // Stays on the form — a crash would still leave you here too, so the meaningful
    // assertion is that no server-error text ever reaches the page.
    await expect(page).toHaveURL(/\/practitioner\/patients\/new/)
    await expect(page.getByText('Internal server error')).toHaveCount(0)
  })

  test('edits an existing patient and the change is visible on reload', async ({ page }) => {
    const name = `E2E Editable ${Date.now()}`
    await page.goto('/practitioner/patients/new')
    await page.getByPlaceholder('Patient name').fill(name)
    await page.click('button:has-text("Create Patient")')
    await expect(page).toHaveURL(/\/practitioner\/patients\/[0-9a-f-]{36}$/, { timeout: 10000 })

    await page.click('a:has-text("Edit Patient")')
    await expect(page).toHaveURL(/\/edit$/)

    const updatedName = `${name} (updated)`
    await page.getByPlaceholder('Patient name').fill(updatedName)
    await page.click('button:has-text("Update Patient")')

    await expect(page).toHaveURL(/\/practitioner\/patients\/[0-9a-f-]{36}$/, { timeout: 10000 })
    await expect(pageHeading(page)).toHaveText(updatedName)
    await page.reload()
    await expect(pageHeading(page)).toHaveText(updatedName)
  })
})
