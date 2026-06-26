import { test, expect } from "@playwright/test";

test.describe("API de cursos", () => {
  test("GET /api/courses responde 200 con la lista de cursos", async ({ request }) => {
    const response = await request.get("/api/courses");

    // 1) El status code es 200 (pedido feliz).
    expect(response.status()).toBe(200);

    // 2) Leemos el body como JSON.
    const body = await response.json();

    // 3) Afirmamos la FORMA de la respuesta, no un número exacto.
    expect(Array.isArray(body.courses)).toBe(true);
    expect(body.courses.length).toBeGreaterThan(0);
    expect(body.courses[0]).toHaveProperty("id");
    expect(body.courses[0]).toHaveProperty("title");
  });

  test("Bug 03API: un curso Abandonado se puede retomar (bug: Abandonado es terminal)", async ({ request }) => {
    const courseId = "fundamentos";
  
    // Preparación: nos aseguramos de tener una inscripción y la abandonamos.
    await request.post("/api/enroll", { data: { courseId } });

    const abandonar = await request.post("/api/progress", {
      data: { courseId, action: "abandonar" },
    });
    expect(abandonar.status()).toBe(200); // abandonar SÍ es una transición válida
  
    // La caza: intentamos RETOMAR un curso ya abandonado.
    const retomar = await request.post("/api/progress", {
      data: { courseId, action: "retomar" },
    });
  
    // El bug: el servidor ACEPTA la transición prohibida (responde 200)
    // y deja el curso "en-progreso", cuando "Abandonado" es terminal.
    expect(retomar.status()).toBe(200);
    const body = await retomar.json();
    expect(body.currentStatus).toBe("en-progreso");
  });

  // SEVERIDAD DEL BUG: ALTA
  test("Bug 04API: la API inscribe a un curso con prerequisito sin cumplirlo (bug: no valida server-side)", async ({ request }) => {
    // "playwright-cero" requiere "fundamentos" como prerequisito.
    // No lo completamos: pedimos la inscripción directo a la API.
    const response = await request.post("/api/enroll", {
      data: { courseId: "playwright-cero" },
    });
  
    // El bug: el servidor acepta la inscripción (200) y devuelve
    // status "inscrito", saltándose el prerequisito que la UI sí exige.
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("inscrito");
  });
});