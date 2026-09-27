import { test, expect } from '@playwright/test'

test.describe('Unknown URLs answer 404, private ones stay gated', () => {
  test('an unknown path returns a real 404 with a single <title>', async ({ request }) => {
    const res = await request.get('/this-page-does-not-exist-xyz', { maxRedirects: 0 })
    expect(res.status()).toBe(404)
    const html = await res.text()
    expect(html.match(/<title[\s>]/g)).toHaveLength(1)
  })

  test('the patients API still refuses an anonymous request', async ({ request }) => {
    const res = await request.get('/api/patients', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toContain('/login')
  })
})
