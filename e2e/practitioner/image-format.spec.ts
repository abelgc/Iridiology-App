import { test, expect } from '@playwright/test'
import path from 'path'

/**
 * A real iPhone HEIC must show up as the iris preview on /practitioner/sessions/new.
 * Chromium reports an empty MIME type for .heic, and the old gate
 * (`file.type.startsWith('image/')` in image-upload.tsx) treated that as "not an image"
 * before any decode. The crop step comes first: Remove renders only after Use crop
 * confirms and onChange receives the canvas JPEG.
 */

const HEIC_RIGHT = path.join(__dirname, '..', 'fixtures', 'iris-right.heic')
const FACE_LEFT = path.join(__dirname, '..', 'fixtures', 'face-eye-left.jpg')

test('a real HEIC photo is accepted and shown as the iris preview', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto('/practitioner/sessions/new')

  const input = page.locator('input[type="file"]').first()
  await input.setInputFiles(HEIC_RIGHT)

  await expect(page.getByRole('button', { name: 'Use crop' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Use crop' }).click()

  await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Please select an image file')).toHaveCount(0)
  await expect(page.getByText('Failed to read file')).toHaveCount(0)
  expect(pageErrors, 'no uncaught client-side exception').toEqual([])
  await expect(page.locator('text=Right Iris')).toBeVisible()
})

test('a face photo waits for Use crop, then shows the iris preview', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto('/practitioner/sessions/new')

  const input = page.locator('input[type="file"]').first()
  await input.setInputFiles(FACE_LEFT)

  await expect(page.getByRole('button', { name: 'Use crop' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0)
  await expect(page.getByText('No eye detected')).toHaveCount(0)
  await expect(page.getByText('Please select an image file')).toHaveCount(0)
  await expect(page.getByText('Failed to read file')).toHaveCount(0)

  await page.getByRole('button', { name: 'Use crop' }).click()

  await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeVisible()
  await expect(page.locator('img[alt="Preview"]').first()).toBeVisible()
  expect(pageErrors, 'no uncaught client-side exception').toEqual([])
})
