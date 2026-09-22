import { test, expect } from '@playwright/test'
import path from 'path'

/**
 * Real HEIC photos through the practitioner's own image-upload.tsx — a SEPARATE
 * implementation from the client's, per image-pipeline.md. Its format check
 * (`file.type.startsWith('image/')`, image-upload.tsx:61) is weaker than the client's real
 * allowlist (image-validation.ts:2), which raised the question of whether a HEIC file
 * could slip past it. In practice it does not: browsers (confirmed here, Chromium) report
 * no MIME type at all for .heic — `''.startsWith('image/')` is false — so it's rejected by
 * the SAME check as any other non-image file, just for a coincidental reason rather than a
 * deliberate one. No crash either way. Still open: real Safari/iOS, which can natively
 * decode HEIC and might report a real image/heic type — untestable from this environment.
 */

const HEIC_RIGHT = path.join(__dirname, '..', 'fixtures', 'iris-right.heic')

test('a real HEIC photo passes the weak type check, then fails at decode — with what message?', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto('/practitioner/sessions/new')

  const start = Date.now()
  const input = page.locator('input[type="file"]').first()
  await input.setInputFiles(HEIC_RIGHT)
  await page.waitForTimeout(3000)
  const elapsedMs = Date.now() - start
  console.log(`Practitioner HEIC upload settled after ${elapsedMs}ms`)

  expect(pageErrors, 'no uncaught client-side exception').toEqual([])

  const bodyText = await page.locator('body').innerText()
  console.log('--- full page text after HEIC upload ---')
  console.log(bodyText)

  // The file input itself is hidden by design (a custom-styled drop zone sits on top of
  // it) — the zone's own visible text is the real "is the page still usable" signal.
  expect(bodyText).toContain('Please select an image file')
  await expect(page.locator('text=Right Iris')).toBeVisible()
})
