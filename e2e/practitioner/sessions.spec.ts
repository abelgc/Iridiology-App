import { test, expect } from '@playwright/test'
import path from 'path'

/**
 * Session creation, focused on today's language-selector fix (session-form.tsx). The
 * form is real and the patient it submits against is real (created via the real
 * /api/patients route against local Supabase) — only /api/analyze is mocked, matching
 * this repo's established convention for anything that would otherwise call a real AI
 * provider (see e2e/client-flow.spec.ts's file header).
 */

const RIGHT = path.join(__dirname, '..', 'fixtures', 'iris-right.jpg')
const LEFT = path.join(__dirname, '..', 'fixtures', 'iris-left.jpg')

async function createPatient(page: import('@playwright/test').Page): Promise<string> {
  const name = `E2E Session Patient ${Date.now()}`
  await page.goto('/practitioner/patients/new')
  await page.getByPlaceholder('Patient name').fill(name)
  await page.click('button:has-text("Create Patient")')
  await expect(page).toHaveURL(/\/practitioner\/patients\/[0-9a-f-]{36}$/, { timeout: 10000 })
  return name
}

test.describe('Session creation — language selector', () => {
  test('shows the language selector for standard mode, defaulting to English', async ({ page }) => {
    await page.goto('/practitioner/sessions/new')
    await expect(page.getByText('Report Language')).toBeVisible()
    await expect(page.locator('select').filter({ has: page.locator('option:has-text("Español")') })).toHaveValue('en')
  })

  test('hides the language selector for comparison and technical review modes', async ({ page }) => {
    await page.goto('/practitioner/sessions/new')
    await page.click('text=Comparison')
    await expect(page.getByText('Report Language')).toHaveCount(0)

    await page.click('text=Technical Review')
    await expect(page.getByText('Report Language')).toHaveCount(0)

    await page.click('text=Standard')
    await expect(page.getByText('Report Language')).toBeVisible()
  })

  test('REGRESSION (2026-09-21): submits the selected language to /api/analyze instead of always defaulting silently', async ({ page }) => {
    const patientName = await createPatient(page)

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/api/analyze', async (route) => {
      capturedBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: '00000000-0000-4000-8000-000000000099' }),
      })
    })

    await page.goto('/practitioner/sessions/new')
    await page.locator('select').first().selectOption({ label: patientName })

    const langSelect = page.locator('select').filter({ has: page.locator('option:has-text("Español")') })
    await langSelect.selectOption('es')

    const inputs = page.locator('input[type="file"]')
    await inputs.nth(0).setInputFiles(RIGHT)
    await inputs.nth(1).setInputFiles(LEFT)

    await page.click('button:has-text("Start Analysis")')
    await expect(page).toHaveURL(/\/practitioner\/sessions\/00000000-0000-4000-8000-000000000099/, { timeout: 10000 })

    expect(capturedBody).not.toBeNull()
    expect((capturedBody as unknown as { language: string }).language).toBe('es')
  })
})
