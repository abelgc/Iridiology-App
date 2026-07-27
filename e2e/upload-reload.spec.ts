import { test, expect, type Page } from '@playwright/test'
import path from 'path'

/**
 * The upload-page reload trap, exercised in a real browser.
 *
 * A unit test cannot prove this one. The defect lives in what survives a genuine page
 * reload — component state, refs, sessionStorage — and in what the page then does with
 * the server's answer. Only a real navigation reproduces it, so this file drives one.
 *
 * The APIs are stubbed at the network boundary with page.route(): `.env.local` points at
 * the PRODUCTION database, and the cron sweeps stalled rows every 5 minutes and retries
 * them at real AI cost. Everything the customer touches — the page, the reload, the
 * storage — is real.
 */

const TOKEN = '22222222-2222-4222-8222-222222222222'
const UPLOAD_URL = `/client/upload?token=${TOKEN}`
const RIGHT = path.join(__dirname, 'fixtures', 'iris-right.jpg')
const LEFT = path.join(__dirname, 'fixtures', 'iris-left.jpg')

function captureDialogs(page: Page): string[] {
  const messages: string[] = []
  page.on('dialog', async (d) => {
    messages.push(d.message())
    await d.dismiss()
  })
  return messages
}

/** The analysis is already under way server-side — a duplicate submit is refused. */
async function stubAnalysisAlreadyRunning(page: Page) {
  await page.route('**/api/client/upload', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'already_processing',
        status: 'analyzing',
        report_download_token: TOKEN,
      }),
    }),
  )
  // The resume path asks this endpoint whether the analysis really started.
  await page.route(`**/api/client/reports/${TOKEN}`, (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not_ready', status: 'analyzing' }),
    }),
  )
}

async function submitBothEyes(page: Page) {
  const inputs = page.locator('input[type="file"]')
  await expect(inputs).toHaveCount(2)
  await inputs.nth(0).setInputFiles(RIGHT)
  await inputs.nth(1).setInputFiles(LEFT)
  // The continue button only enables once both images pass client-side validation.
  const submit = page.locator('button:not([disabled])').filter({ hasText: /continue|continuar|weiter/i })
  await expect(submit.first()).toBeEnabled({ timeout: 15000 })
  await submit.first().click()
}

test.describe('Upload page — surviving a reload', () => {
  test('REGRESSION (2026-07-27): a reload mid-flow does not dump the client back on an empty form', async ({ page }) => {
    // The trap: state lived only in memory, so a reload reset the page to 'form'. The
    // client re-picked their photos, watched the full 15s video again, and was then told
    // "Algo salió mal" — because the server correctly refused a duplicate run. Their
    // analysis was completing perfectly the whole time, out of reach.
    await stubAnalysisAlreadyRunning(page)
    const dialogs = captureDialogs(page)

    await page.goto(UPLOAD_URL)
    await submitBothEyes(page)

    // Mid-flow: the POST has gone, the waiting video is on screen.
    await page.reload()

    // The client must not be sent back to square one, and must never see an error for
    // an analysis that is running fine.
    await expect(page).toHaveURL(new RegExp(`/client/report/${TOKEN}`), { timeout: 20000 })
    expect(dialogs, 'a running analysis must not raise an error').toEqual([])
  })

  test('a reload before the upload ever left the machine returns to a usable form, not a report that will never arrive', async ({ page }) => {
    // The counterpart. State is persisted when the request is dispatched, so a browser
    // that dies in the milliseconds before it leaves would otherwise resume into a report
    // page that polls for six minutes and fails. Here the server says the row is still
    // awaiting an upload, so the client belongs on the form.
    await page.route('**/api/client/upload', (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'already_processing' }) }),
    )
    await page.route(`**/api/client/reports/${TOKEN}`, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not_ready', status: 'paid' }),
      }),
    )

    await page.goto(UPLOAD_URL)
    await submitBothEyes(page)
    await page.reload()

    await expect(page.locator('input[type="file"]').first()).toBeVisible({ timeout: 20000 })
    await expect(page).not.toHaveURL(/\/client\/report\//)
  })
})
