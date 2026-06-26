import { test, expect } from "@playwright/test";

test.describe("Subida de CV", () => {
  test("Bug 01Upload: la API acepta un PNG cuando la regla exige PDF (bug: no valida el tipo)", async ({ request }) => {
    const respuesta = await request.post("/api/upload", {
      multipart: {
        file: {
          name: "foto.png",
          mimeType: "image/png",
          buffer: Buffer.from("esto no es un pdf"),
        },
      },
    });

    // El bug: acepta el PNG. Debería rechazarlo con un 422.
    expect(respuesta.status()).toBe(200);
  });
  
  test("Bug 02Upload: la API acepta un archivo de 2.5 MB cuando el máximo es 2 (bug: redondea para abajo)", async ({ request }) => {
    const dosYMedioMb = Math.floor(2.5 * 1024 * 1024);
    const respuesta = await request.post("/api/upload", {
      multipart: {
        file: {
          name: "cv.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(dosYMedioMb),
        },
      },
    });
  
    // El bug: 2.5 MB pasa porque Math.floor(2.5) = 2, y 2 no es > 2.
    expect(respuesta.status()).toBe(200);
  });

});