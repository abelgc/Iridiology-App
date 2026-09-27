import { test, expect } from '@playwright/test'

const NOINDEX = /<meta name="robots" content="noindex, nofollow"/

test.describe('REGRESSION (SEO audit 2026-09-26): metadata and indexing', () => {
  test('the home page has one viewport, an English og:locale and stays indexable', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html.match(/<meta name="viewport"/g) ?? []).toHaveLength(1)
    expect(html).toContain('<meta property="og:locale" content="en_US"')
    expect(html).not.toMatch(NOINDEX)
  })

  for (const path of ['/login', '/forgot-password', '/reset-password', '/client/intake', '/client/upload', '/client/report/not-a-real-token']) {
    test(`${path} is kept out of search results`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status()).toBe(200)
      expect(await res.text()).toMatch(NOINDEX)
    })
  }

  test('/login has its own title instead of repeating the home page title', async ({ request }) => {
    const html = await (await request.get('/login')).text()
    expect(html).toContain('<title>Sign in | Narasimha Solutions</title>')
  })
})

test.describe('REGRESSION (SEO audit 2026-09-26): icons and manifest', () => {
  for (const path of ['/favicon.ico', '/apple-icon.png', '/manifest.webmanifest']) {
    test(`${path} is served`, async ({ request }) => {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(200)
    })
  }

  test('the icon link is a stable path with no query string', async ({ request }) => {
    const html = await (await request.get('/')).text()
    const href = html.match(/<link rel="icon" href="([^"]+)"/)?.[1]
    expect(href).toBe('/icon.png')
  })
})

test.describe('REGRESSION (SEO audit 2026-09-26): landing page outline', () => {
  test('an H2 introduces the plans before the plan names (H3)', async ({ page }) => {
    await page.goto('/')
    const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((el) => el.tagName))
    expect(levels[0]).toBe('H1')
    expect(levels.indexOf('H2')).toBeGreaterThan(-1)
    expect(levels.indexOf('H2')).toBeLessThan(levels.indexOf('H3'))
  })

  test('the header logo, the largest early paint, is not lazy-loaded', async ({ page }) => {
    await page.goto('/')
    expect(await page.locator('header img').first().getAttribute('loading')).not.toBe('lazy')
  })
})
