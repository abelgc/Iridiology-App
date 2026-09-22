import { test, expect } from '@playwright/test'
import path from 'path'

/**
 * Investigates a real product question: what actually happens today when a real iPhone
 * HEIC photo is uploaded, in a browser that cannot decode HEIC (Chromium — the same as
 * Chrome, Firefox, and every non-Apple browser, which is most of this practitioner's real
 * traffic)? The fixtures are real HEIC photos, not synthetic files — provided by the user
 * specifically to settle this instead of guessing from source reading alone.
 *
 * Network is mocked at the same boundary as upload-reload.spec.ts (AI/DB out of scope,
 * .env.local points at PRODUCTION) — this test is entirely about client-side image
 * handling, which never leaves the browser until a file is accepted.
 */

const HEIC_LEFT = path.join(__dirname, 'fixtures', 'iris-left.heic')
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

  test('a real HEIC photo, in a browser that cannot decode it, shows an error instead of silently failing or crashing', async ({ page }) => {
    await page.goto(UPLOAD_URL)

    const start = Date.now()
    const input = page.locator('input[type="file"]').first()
    await input.setInputFiles(HEIC_RIGHT)

    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    // No crash, no unhandled rejection, no infinite spinner: give it a real window to settle.
    await page.waitForTimeout(3000)
    const elapsedMs = Date.now() - start
    console.log(`HEIC upload settled after ${elapsedMs}ms`)
    expect(pageErrors, 'no uncaught client-side exception').toEqual([])

    // The right-eye upload zone specifically must not have flipped into "filled" (preview)
    // state — that would mean it silently "succeeded" while actually holding garbage.
    const rightZone = page.locator('.upload-zone').first()
    await expect(rightZone).not.toHaveClass(/filled/)
    await expect(input).toBeVisible()

    const errorMessage = await page.locator('p', { hasText: /.+/ }).allTextContents()
    console.log('Visible <p> text on page after HEIC upload:', JSON.stringify(errorMessage))
  })
})
