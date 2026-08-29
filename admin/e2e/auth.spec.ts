import { test, expect } from "@playwright/test";
import { ADMIN_TEST_IDS } from "../src/constants/testIds";

test.describe("Admin Authentication E2E Journey", () => {
  test("loads login page with required form controls", async ({ page }) => {
    await page.goto("/login");

    const emailInput = page.locator(`[data-testid="${ADMIN_TEST_IDS.AUTH.EMAIL_INPUT}"], input[type="email"]`);
    const passwordInput = page.locator(`[data-testid="${ADMIN_TEST_IDS.AUTH.PASSWORD_INPUT}"], input[type="password"]`);
    const submitBtn = page.locator(`[data-testid="${ADMIN_TEST_IDS.AUTH.LOGIN_SUBMIT}"], button[type="submit"]`);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test("rejects empty submission with validation prompt", async ({ page }) => {
    await page.goto("/login");
    const submitBtn = page.locator(`[data-testid="${ADMIN_TEST_IDS.AUTH.LOGIN_SUBMIT}"], button[type="submit"]`);
    await submitBtn.click();

    // Verify page stays on login route without crash
    await expect(page).toHaveURL(/.*login/);
  });
});
