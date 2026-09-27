import { test, expect } from '@playwright/test'

test.describe('Crawlers can find the sitemap', () => {
  test('/sitemap.xml lists the public home page and nothing private', async ({ request }) => {
    const res = await request.get('/sitemap.xml', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('xml')
    const xml = await res.text()
    expect(xml).toContain('<loc>https://narasimhasolutions.com</loc>')
    expect(xml).not.toMatch(/\/(login|practitioner|client|api)/)
  })

  test('robots.txt points crawlers at the sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(await res.text()).toContain('Sitemap: https://narasimhasolutions.com/sitemap.xml')
  })
})
