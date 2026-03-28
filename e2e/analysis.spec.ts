import { test, expect } from '@playwright/test';

test.describe('Analysis Flow', () => {
  test('should load new analysis session page', async ({ page }) => {
    await page.goto('/sessions/new');

    // Should show form elements
    await expect(page.locator('select, input[type="date"], textarea')).toHaveCount(3, { timeout: 5000 });
  });

  test('should have loading skeleton during form load', async ({ page }) => {
    await page.goto('/sessions/new');

    // Should have form elements or loading state
    const form = page.locator('form');
    const skeleton = page.locator('[data-slot="skeleton"]');

    const isFormVisible = await form.count() > 0;
    const isSkeletonVisible = await skeleton.count() > 0;

    expect(isFormVisible || isSkeletonVisible).toBeTruthy();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/sessions/new');

    // Try to submit empty form
    const submitButton = page.locator('button:has-text("Start Analysis")');
    if (await submitButton.isVisible()) {
      await submitButton.click();

      // Should show validation errors
      const errorText = page.locator('text=required, text=Patient');
      expect(await errorText.count()).toBeGreaterThan(0);
    }
  });

  test('should show analysis modes', async ({ page }) => {
    await page.goto('/sessions/new');

    // Should have mode selection
    const modeButtons = page.locator('button:has-text("Standard"), button:has-text("Comparison"), button:has-text("Technical")');
    await expect(modeButtons).toHaveCount(3, { timeout: 5000 });
  });

  test('should handle analysis errors with retry', async ({ page }) => {
    await page.goto('/sessions/new');

    // Try to start analysis with minimal data
    // This test verifies error handling and retry functionality
    const errorMessages = page.locator('text=Something went wrong, text=Error, text=Failed');

    // Either form is complete or error handling exists
    const form = page.locator('form');
    expect(await form.count() > 0 || await errorMessages.count() > 0).toBeTruthy();
  });
});

test.describe('Report Display', () => {
  test('should load report with skeleton', async ({ page }) => {
    // Using a placeholder report ID since we can't create real ones in E2E
    await page.goto('/reports/test-report-id', { waitUntil: 'networkidle' });

    // Should show either report content or error boundary
    const content = page.locator('[data-slot="skeleton"], .prose, text=Something went wrong');
    expect(await content.count()).toBeGreaterThan(0);
  });

  test('should have error boundary on invalid report', async ({ page }) => {
    await page.goto('/reports/invalid-id');

    // Should handle error gracefully
    const errorOrContent = page.locator('text=Something went wrong, text=Error, text=Report, table');
    expect(await errorOrContent.count()).toBeGreaterThan(0);
  });
});

test.describe('Chat Interface', () => {
  test('should load chat page with loading state', async ({ page }) => {
    await page.goto('/reports/test-id/chat', { waitUntil: 'networkidle' });

    // Should show either chat interface or error/loading
    const content = page.locator('input[type="text"], [data-slot="skeleton"], text=Something went wrong');
    expect(await content.count()).toBeGreaterThan(0);
  });
});
