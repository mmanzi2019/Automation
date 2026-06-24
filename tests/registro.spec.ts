import { test, expect } from "@playwright/test";

test.describe("Registro", () => {
  test("un alumno se registra con datos válidos", async ({ page }) => {
    await page.goto("/registro");

    await page.getByTestId("register-name").fill("Ana García");
    await page.getByTestId("register-email").fill("mayramanzi95+3@ejemplo.com");
    await page.getByTestId("register-password").fill("Segura2026!");
    await page.getByTestId("register-age").fill("30");
    await page.getByTestId("register-submit").click();

    await expect(page.getByTestId("register-success")).toBeVisible();
  });
});