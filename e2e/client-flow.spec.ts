import { test, expect } from '@playwright/test';

/**
 * End-to-end coverage for the paying-client journey.
 *
 * These tests drive a real browser through the real page code: real navigation,
 * real sessionStorage, real React state. What they deliberately do NOT do is let
 * a request reach Supabase or an AI provider. Two reasons, both concrete:
 *
 *   1. `.env.local` points at the PRODUCTION database. A test run would create
 *      real rows in `client_analyses`.
 *   2. Worse, the cron deployed on 2026-07-26 sweeps rows stuck in
 *      `stage2_processing` between 5 minutes and 24 hours old and retries them.
 *      A test row abandoned mid-pipeline would be picked up and re-run at real
 *      AI cost, unattended.
 *
 * So the API layer is intercepted at the network boundary with `page.route()`.
 * Everything the customer actually touches is real; only the far side of the
 * fetch is canned. That is the seam where every bug in this file lived.
 */

const TOKEN = '11111111-1111-4111-8111-111111111111';
const PAYMENT_URL = `/client/intake/payment?token=${TOKEN}&tier=basic_1990`;

test.describe('Client journey — anonymous access', () => {
  // The proxy has redirected client-facing paths to /login twice in production
  // (2026-07-25: /intro.mp4 and /robots.txt). A client is never logged in, so any
  // redirect to /login here is a total outage for the paying flow.
  test('the landing page serves the client app to a logged-out visitor, never /login', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('the landing page fits a phone without sideways scrolling', async ({ page }) => {
    // Salvaged from responsive.spec.ts, which asserted viewport widths it had just set
    // itself. This asserts something the test cannot control: that the page's own content
    // fits the screen. Most clients arrive on a phone, and a page that scrolls sideways
    // reads as broken before they have read a word.
    await page.setViewportSize({ width: 390, height: 844 }) // iPhone 14
    await page.goto('/')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the page must not scroll horizontally on a phone').toBeLessThanOrEqual(1)
  })

  test('static assets the client flow depends on are reachable without a session', async ({ request }) => {
    // Each of these is loaded by a client who has no cookies at all. When the proxy
    // matcher stopped exempting them, the <video> element received an HTML login
    // page instead of video, and link previews lost their image.
    for (const path of ['/robots.txt', '/og.png', '/icon.png']) {
      const res = await request.get(path);
      expect(res.status(), `${path} must not require a session`).toBe(200);
    }
  });
});

test.describe('Client journey — payment step', () => {
  test('REGRESSION (2026-07-26 live-demo incident): an already-paid order moves forward instead of showing an error', async ({ page }) => {
    // The server refuses to mint a second Stripe session for a row that has already
    // been paid — correct, it is what stops a double charge. It answers 200 with no
    // checkout URL. The page used to read that absence as failure and alert
    // "Algo salió mal" at a customer who had just successfully paid.
    await page.route('**/api/client/payment/checkout-session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          outcome: 'already_paid',
          redirect_to: `/client/upload?token=${TOKEN}`,
          report_download_token: TOKEN,
          status: 'paid',
        }),
      }),
    );

    await page.goto(PAYMENT_URL);
    await page.click('button:has-text("Proceed to payment")');

    await expect(page).toHaveURL(new RegExp(`/client/upload\\?token=${TOKEN}`));
    // 2026-07-29: alert() was replaced with a toast (src/components/ui/toaster.tsx);
    // a destructive toast is rendered with the `border-red-200` class, so its absence
    // is the toast-era equivalent of "no dialog was ever raised".
    await expect(page.locator('.border-red-200'), 'a paid customer must never be shown an error').toHaveCount(0);
  });

  test('a genuine payment failure still surfaces an error and keeps the customer on the page', async ({ page }) => {
    // The counterpart to the test above: silencing the false error must not have
    // silenced the real one.
    await page.route('**/api/client/payment/checkout-session', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'stripe_session_failed' }),
      }),
    );

    await page.goto(PAYMENT_URL);
    await page.click('button:has-text("Proceed to payment")');

    // 2026-07-29: alert() was replaced with a toast whose description is
    // `${t('error')} (${code})` (src/app/client/intake/payment/page.tsx) — the
    // parenthesised code is what a native alert's message used to carry.
    await expect(page.getByText('(stripe_session_failed)')).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/client\/intake\/payment/);
  });

  test('a dropped connection tells the customer something instead of leaving a dead button', async ({ page }) => {
    // The checkout fetch was unguarded: a network failure left `submitting` true,
    // so the button was disabled forever with no message at all.
    await page.route('**/api/client/payment/checkout-session', (route) => route.abort('failed'));

    await page.goto(PAYMENT_URL);
    await page.click('button:has-text("Proceed to payment")');

    await expect(page.getByText('(network)')).toBeVisible({ timeout: 5000 });
    // The button must be usable again so the customer can retry once they reconnect.
    await expect(page.locator('button:has-text("Proceed to payment")')).toBeEnabled();
  });
});
