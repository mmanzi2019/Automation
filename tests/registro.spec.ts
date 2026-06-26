import { test, expect } from "@playwright/test";

test.describe("Registro de un estudiante", () => {
  test("un alumno se registra con datos válidos", async ({ page }) => {
    await page.goto("/registro");

    await page.getByTestId("register-name").fill("Ana García");
    await page.getByTestId("register-email").fill("mayramanzi95+10@ejemplo.com");
    await page.getByTestId("register-password").fill("Segura2026!");
    await page.getByTestId("register-age").fill("30");
    await page.getByTestId("register-submit").click();

    await expect(page.getByTestId("register-success")).toBeVisible();
  });

  test("Bug 01Registro: el registro acepta un password de 65 caracteres (bug: el máximo es 64)", async ({ page }) => {
    await page.goto("/registro");
  
    await page.getByTestId("register-name").fill("Test Tester");
    await page.getByTestId("register-email").fill("mayramanzi95+5@ejemplo.com");
    // 65 caracteres exactos: justo uno más que el máximo permitido.
    // "a".repeat(x)es igual a escribir x cantidad de veces la letra a
    await page.getByTestId("register-password").fill("a".repeat(65));
    await page.getByTestId("register-age").fill("25");
    await page.getByTestId("register-submit").click();
  
    // Dejamos constancia del bug: con 65 caracteres aparece el éxito
    // cuando la regla (máx 64) exige que se rechace.
    await expect(page.getByTestId("register-success")).toBeVisible();
  });

  test("Bug 02Registro: el registro acepta el email 'x@' sin dominio (bug: falta validar el dominio)", async ({ page }) => {
    await page.goto("/registro");
  
    await page.getByTestId("register-name").fill("Test Tester");
    // Arroba sin dominio. Debería rechazarse.
    await page.getByTestId("register-email").fill("x5@");
    await page.getByTestId("register-password").fill("Segura2026!");
    await page.getByTestId("register-age").fill("25");
    await page.getByTestId("register-submit").click();
  
    // El bug: 'x@' pasa la validación y el registro tiene éxito.
    await expect(page.getByTestId("register-success")).toBeVisible();
    // toHaveCount(0) afirma que un elemento NO está en la página (hay cero coincidencias).
    await expect(page.getByTestId("register-email-error")).toHaveCount(0); 
  });

  test(" el registro no acepta el email sin @", async ({ page }) => {
    await page.goto("/registro");
  
    await page.getByTestId("register-name").fill("Test Tester");
    await page.getByTestId("register-email").fill("x4.com");
    await page.getByTestId("register-password").fill("Segura2026!");
    await page.getByTestId("register-age").fill("25");
    await page.getByTestId("register-submit").click();

    await expect(page.getByTestId("register-email-error")).toBeVisible(); 
    await expect(page.getByTestId("register-success")).toHaveCount(0); 
  });

});

