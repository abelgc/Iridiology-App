import { test, expect } from '@playwright/test'
import path from 'path'

/**
 * A real iPhone HEIC must fill the client upload zone. Chromium cannot decode HEIC
 * natively, so the page has to convert it to JPEG before the existing canvas path.
 * Network is mocked at the same boundary as upload-reload.spec.ts (AI/DB out of scope).
 */

const HEIC_RIGHT = path.join(__dirname, 'fixtures', 'iris-right.heic')
const TOKEN = '33333333-3333-4333-8333-333333333333'
const UPLOAD_URL = `/client/upload?token=${TOKEN}`

test.describe('HEIC upload — /client (iris-image-upload.tsx)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/client/reports/${TOKEN}`, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not_ready', status: 'paid' }),
      }),
    )
  })

  test('a real HEIC photo is accepted and fills the upload zone', async ({ page }) => {
    test.setTimeout(90_000)
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.goto(UPLOAD_URL)

    const input = page.locator('input[type="file"]').first()
    await input.setInputFiles(HEIC_RIGHT)

    const rightZone = page.locator('.upload-zone').first()
    await expect(rightZone).toHaveClass(/filled/, { timeout: 60_000 })
    await expect(page.getByText('This photo could not be read. Use JPEG, PNG, WebP, GIF, AVIF or HEIC.')).toHaveCount(0)
    expect(pageErrors, 'no uncaught client-side exception').toEqual([])
  })
})
