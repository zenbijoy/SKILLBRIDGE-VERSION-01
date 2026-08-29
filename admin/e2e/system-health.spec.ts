import { test, expect } from "@playwright/test";

test.describe("Admin System Health View", () => {
  test("unauthenticated access redirects to login", async ({ page }) => {
    await page.goto("/health");
    await expect(page).toHaveURL(/.*login/);
  });
});
