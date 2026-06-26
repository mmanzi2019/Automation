import { test, expect } from "@playwright/test";

test.describe("Paginación de estudiantes", () => {
  test("Bug 05Estudiantes: la API reporta 2 páginas con 25 estudiantes (bug: deberían ser 3)", async ({ request }) => {
    // Le pedimos la primera página de 10 a la API.
    const respuesta = await request.get("/api/students?page=1&pageSize=10");
    const data = await respuesta.json();

    // Confirmamos el escenario: hay 25 estudiantes en total.
    expect(data.total).toBe(25);

    // El bug: con 25 y de a 10 deberían ser 3 páginas, pero la API dice 2.
    // 25 / 10 = 2.5; usa Math.floor (2) cuando debería usar Math.ceil (3).
    expect(data.totalPages).toBe(2);
  });
});