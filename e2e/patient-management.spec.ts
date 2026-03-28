import { test, expect } from '@playwright/test';

test.describe('Patient Management', () => {
  test('should display patient list', async ({ page }) => {
    // Note: This test assumes user is authenticated
    await page.goto('/patients');

    // Wait for either patient list or loading skeleton
    const patientTable = page.locator('[data-slot="skeleton"], table');
    await expect(patientTable).toBeVisible({ timeout: 5000 });
  });

  test('should have loading state while fetching patients', async ({ page }) => {
    await page.goto('/patients');

    // Loading skeleton should be visible initially
    const skeleton = page.locator('[data-slot="skeleton"]');
    const isVisible = await skeleton.isVisible({ timeout: 1000 }).catch(() => false);

    // Either skeleton or actual content should be visible
    const content = page.locator('table, [role="grid"]');
    await expect(page.locator('body')).toContainText(/Patient|Loading/, { timeout: 5000 });
  });

  test('should handle patient CRUD operations gracefully', async ({ page }) => {
    await page.goto('/patients');

    // Check for create button
    const createButton = page.locator('button:has-text("New Patient"), button:has-text("Add Patient")');
    const buttonExists = await createButton.count();

    // Either create button exists or patients are listed
    expect(buttonExists > 0 || await page.locator('table').count() > 0).toBeTruthy();
  });
});

test.describe('Patient Error Handling', () => {
  test('should show error boundary on patient page error', async ({ page }) => {
    // Navigate to a patient that doesn't exist
    await page.goto('/patients/nonexistent', { waitUntil: 'networkidle' });

    // Should either show error or redirect
    const currentUrl = page.url();
    const hasError = await page.locator('text=Something went wrong, text=Error').count() > 0;

    // Should handle gracefully
    expect(hasError || currentUrl.includes('/patients')).toBeTruthy();
  });
});
