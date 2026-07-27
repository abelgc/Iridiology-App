import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should load login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Iridology Analysis/);
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Try to submit with empty credentials
    await page.click('button:has-text("Sign in")');

    // Should remain on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('should be redirected to login when not authenticated', async ({ page }) => {
    // A real practitioner route. This used to point at `/patients`, which was moved under
    // /practitioner long ago — so the assertion passed for a path that no longer existed,
    // proving nothing. Full route coverage lives in practitioner-access.spec.ts.
    await page.goto('/practitioner/patients');
    await expect(page).toHaveURL(/\/login/);
  });
});
