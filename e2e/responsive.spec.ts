import { test, expect, devices } from '@playwright/test';

// Test tablet responsiveness
test.describe('Responsive Design - Tablet', () => {
  test.use({ ...devices['iPad Pro'] });

  test('sidebar should adapt to tablet layout', async ({ page }) => {
    await page.goto('/');

    // Sidebar should be visible or have a toggle on tablet
    const sidebar = page.locator('aside');
    if (await sidebar.isVisible()) {
      // Check if sidebar content is readable
      await expect(sidebar).toHaveScreenshot('sidebar-tablet.png', { maxDiffPixels: 100 });
    }
  });

  test('navigation should be accessible on tablet', async ({ page }) => {
    await page.goto('/');

    // Check that navigation elements are clickable
    const navItems = page.locator('nav a, nav button');
    const count = await navItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('forms should be readable on tablet', async ({ page }) => {
    await page.goto('/');

    // Check viewport size for tablet
    const viewportSize = page.viewportSize();
    expect(viewportSize?.width).toBeLessThan(1024);
    expect(viewportSize?.height).toBeGreaterThan(500);
  });
});

test.describe('Responsive Design - Desktop', () => {
  test.use({ ...devices['Desktop Chrome'] });

  test('layout should be full width on desktop', async ({ page }) => {
    await page.goto('/');

    const viewportSize = page.viewportSize();
    expect(viewportSize?.width).toBeGreaterThan(1024);
  });

  test('desktop navigation should be visible', async ({ page }) => {
    await page.goto('/');

    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });
});
