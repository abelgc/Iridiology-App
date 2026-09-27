import { test, expect } from '@playwright/test'
import path from 'path'

/**
 * A real iPhone HEIC must show up as the iris preview on /practitioner/sessions/new.
 * Chromium reports an empty MIME type for .heic, and the old gate
 * (`file.type.startsWith('image/')` in image-upload.tsx) treated that as "not an image"
 * before any decode. The Remove button is the observable success: it renders only after
 * processFile has called onChange with the canvas JPEG.
 */

const HEIC_RIGHT = path.join(__dirname, '..', 'fixtures', 'iris-right.heic')

test('a real HEIC photo is accepted and shown as the iris preview', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto('/practitioner/sessions/new')

  const input = page.locator('input[type="file"]').first()
  await input.setInputFiles(HEIC_RIGHT)

  await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Please select an image file')).toHaveCount(0)
  await expect(page.getByText('Failed to read file')).toHaveCount(0)
  expect(pageErrors, 'no uncaught client-side exception').toEqual([])
  await expect(page.locator('text=Right Iris')).toBeVisible()
})
