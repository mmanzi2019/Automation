import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://academia-sin-humo.vercel.app';
const OUT_DIR = path.resolve('Exploratorio-registroEstudiante');
const EVID_DIR = path.join(OUT_DIR, 'evidencia');
const SESSION_START = Date.now();
const SESSION_DURATION_MS = 2 * 60 * 1000;

const findings = [];
let screenshotIndex = 0;
let validAccount = null;

function elapsed() {
  return ((Date.now() - SESSION_START) / 1000).toFixed(1);
}

function timeLeft() {
  return SESSION_DURATION_MS - (Date.now() - SESSION_START);
}

function addFinding(bug) {
  findings.push({ ...bug, timestamp: elapsed() + 's' });
}

async function screenshot(page, label) {
  screenshotIndex += 1;
  const safe = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const filename = `${String(screenshotIndex).padStart(2, '0')}-${safe}.png`;
  const filepath = path.join(EVID_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return `evidencia/${filename}`;
}

async function clearForm(page) {
  await page.getByTestId('register-name').fill('');
  await page.getByTestId('register-email').fill('');
  await page.getByTestId('register-password').fill('');
  await page.getByTestId('register-age').fill('');
}

async function submitRegister(page) {
  await page.getByTestId('register-submit').click();
  await page.waitForTimeout(600);
}

async function getRegisterState(page) {
  const success = await page.getByTestId('register-success').isVisible().catch(() => false);
  const errors = await page.locator('[data-testid$="-error"]').evaluateAll((els) =>
    els
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).display !== 'none')
      .map((el) => ({
        testId: el.getAttribute('data-testid'),
        text: el.textContent?.trim() ?? '',
      }))
  );
  const values = {
    name: await page.getByTestId('register-name').inputValue(),
    email: await page.getByTestId('register-email').inputValue(),
    password: await page.getByTestId('register-password').inputValue(),
    age: await page.getByTestId('register-age').inputValue(),
  };
  return { success, errors, values };
}

async function runInvalidCase(page, caseInfo) {
  if (timeLeft() <= 0) return;

  await page.goto(`${BASE_URL}/registro`);
  await clearForm(page);
  if (caseInfo.name !== undefined) await page.getByTestId('register-name').fill(caseInfo.name);
  if (caseInfo.email !== undefined) await page.getByTestId('register-email').fill(caseInfo.email);
  if (caseInfo.password !== undefined) await page.getByTestId('register-password').fill(caseInfo.password);
  if (caseInfo.age !== undefined) await page.getByTestId('register-age').fill(String(caseInfo.age));

  await submitRegister(page);
  const state = await getRegisterState(page);

  const rejected = !state.success && state.errors.length > 0;
  const accepted = state.success;
  const isBug = caseInfo.expectReject ? accepted : caseInfo.expectAccept ? !accepted : false;

  if (isBug) {
    const evidence = await screenshot(page, caseInfo.id);
    addFinding({
      id: caseInfo.id,
      severity: caseInfo.severity ?? 'Media',
      req: caseInfo.req,
      title: caseInfo.title,
      steps: caseInfo.steps,
      data: caseInfo.data,
      expected: caseInfo.expected,
      actual: accepted
        ? 'El registro fue aceptado (mensaje de éxito visible).'
        : state.errors.length
          ? `No se rechazó correctamente. Errores: ${state.errors.map((e) => e.text).join(' | ')}`
          : 'No hubo éxito ni mensajes de error visibles.',
      evidence,
      category: caseInfo.category,
    });
  }

  return { state, isBug };
}

function buildHtmlReport() {
  const bugRows = findings
    .map(
      (f, i) => `
      <article class="bug-card" id="bug-${i + 1}">
        <header>
          <span class="badge ${f.severity.toLowerCase()}">${f.severity}</span>
          <span class="badge req">${f.req}</span>
          <h2>Bug ${i + 1}: ${f.title}</h2>
          <p class="meta">Categoría: ${f.category} · Detectado a los ${f.timestamp}</p>
        </header>
        <section>
          <h3>Pasos para reproducir</h3>
          <ol>${f.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
        </section>
        <section class="grid-2">
          <div>
            <h3>Datos de prueba</h3>
            <pre>${f.data}</pre>
            <h3>Resultado esperado</h3>
            <p>${f.expected}</p>
            <h3>Resultado actual</h3>
            <p class="actual">${f.actual}</p>
          </div>
          <div>
            <h3>Evidencia</h3>
            <a href="${f.evidence}" target="_blank">
              <img src="${f.evidence}" alt="Evidencia ${f.title}" loading="lazy" />
            </a>
          </div>
        </section>
      </article>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exploratorio — Registro de estudiante</title>
  <style>
    :root {
      --bg: #0f1419;
      --card: #1a2332;
      --text: #e7ecf3;
      --muted: #9aa8bc;
      --accent: #5b9cff;
      --high: #ff6b6b;
      --media: #ffb347;
      --baja: #ffd166;
      --ok: #6bcb77;
      --border: #2a3548;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: linear-gradient(180deg, #0b1020, var(--bg));
      color: var(--text);
      line-height: 1.5;
    }
    .container { max-width: 1100px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    header.hero {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 2rem;
    }
    h1 { margin: 0 0 .5rem; font-size: 1.9rem; }
    .subtitle { color: var(--muted); margin: 0; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0 2rem;
    }
    .stat {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.25rem;
    }
    .stat strong { display: block; font-size: 2rem; color: var(--accent); }
    .stat span { color: var(--muted); font-size: .9rem; }
    .bug-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .bug-card header h2 { margin: .75rem 0 .25rem; font-size: 1.25rem; }
    .badge {
      display: inline-block;
      padding: .2rem .55rem;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 700;
      margin-right: .35rem;
      text-transform: uppercase;
    }
    .badge.alta { background: rgba(255,107,107,.18); color: var(--high); }
    .badge.media { background: rgba(255,179,71,.18); color: var(--media); }
    .badge.baja { background: rgba(255,209,102,.18); color: var(--baja); }
    .badge.req { background: rgba(91,156,255,.15); color: var(--accent); }
    .meta { color: var(--muted); margin: 0; font-size: .9rem; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
    }
    @media (max-width: 800px) { .grid-2 { grid-template-columns: 1fr; } }
    pre {
      background: #101826;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: .75rem;
      overflow-x: auto;
      white-space: pre-wrap;
      font-size: .85rem;
    }
    .actual { color: var(--high); font-weight: 600; }
    img {
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #000;
    }
    .scope, .notes {
      background: rgba(91,156,255,.08);
      border-left: 4px solid var(--accent);
      padding: 1rem 1.25rem;
      border-radius: 0 10px 10px 0;
      margin-bottom: 1.5rem;
    }
    .pass { color: var(--ok); }
    footer { color: var(--muted); text-align: center; margin-top: 2rem; font-size: .85rem; }
  </style>
</head>
<body>
  <div class="container">
    <header class="hero">
      <h1>Reporte exploratorio — Registro de estudiante</h1>
      <p class="subtitle">Academia sin Humo · Sesión de ~2 minutos · ${new Date().toLocaleString('es-ES')}</p>
      <p class="subtitle">Analista: QA Senior (exploratorio guiado por REQ-R01 a REQ-R07)</p>
    </header>

    <div class="summary">
      <div class="stat"><strong>${findings.length}</strong><span>Bugs encontrados</span></div>
      <div class="stat"><strong>~2 min</strong><span>Duración de la sesión</span></div>
      <div class="stat"><strong>${validAccount ? 'OK' : 'N/A'}</strong><span>Registro válido + login</span></div>
      <div class="stat"><strong>${screenshotIndex}</strong><span>Capturas de evidencia</span></div>
    </div>

    <section class="scope">
      <h3>Alcance explorado</h3>
      <ul>
        <li>Navegación: Inicio → <em>Empezar a practicar</em> → /registro</li>
        <li>Datos inválidos: nombre vacío/espacios, emails incorrectos, contraseñas inválidas, edad fuera de rango</li>
        <li>Flujo feliz: cuenta válida + inicio de sesión con la cuenta creada</li>
        <li>Referencia: especificación REQ-R01 a REQ-R07 en /documentacion</li>
      </ul>
      ${
        validAccount
          ? `<p class="pass">Cuenta válida creada para flujo feliz: <code>${validAccount.email}</code></p>`
          : ''
      }
    </section>

    <h2>Hallazgos</h2>
    ${findings.length ? bugRows : '<p>No se detectaron bugs durante la sesión.</p>'}

    <footer>
      Generado automáticamente · Exploratorio-registroEstudiante · Playwright
    </footer>
  </div>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(EVID_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. Ir a inicio y Empezar a practicar
  await page.goto(BASE_URL);
  await page.getByRole('link', { name: /Empezar a practicar/i }).first().click();
  await page.waitForURL('**/registro');

  const invalidCases = [
    {
      id: 'nombre-vacio',
      category: 'Nombre',
      req: 'REQ-R01',
      title: 'Registro acepta nombre vacío',
      severity: 'Alta',
      name: '',
      email: 'valido@ejemplo.com',
      password: 'Segura2026!',
      age: '25',
      expectReject: true,
      steps: [
        'Ir a /registro desde "Empezar a practicar"',
        'Dejar el campo Nombre vacío',
        'Completar email, contraseña y edad válidos',
        'Enviar el formulario',
      ],
      data: 'Nombre: (vacío)\nEmail: valido@ejemplo.com\nPassword: Segura2026!\nEdad: 25',
      expected: 'Debe rechazarse: todos los campos son obligatorios (REQ-R01).',
    },
    {
      id: 'nombre-solo-espacios',
      category: 'Nombre',
      req: 'REQ-R02',
      title: 'Registro acepta nombre con solo espacios',
      severity: 'Media',
      name: '     ',
      email: 'valido2@ejemplo.com',
      password: 'Segura2026!',
      age: '25',
      expectReject: true,
      steps: [
        'Ir a /registro',
        'Ingresar solo espacios en Nombre',
        'Completar resto de campos válidos',
        'Enviar',
      ],
      data: 'Nombre: "     "\nEmail: valido2@ejemplo.com\nPassword: Segura2026!\nEdad: 25',
      expected: 'Debe rechazarse: nombre inválido (2-50 caracteres significativos).',
    },
    {
      id: 'nombre-1-caracter',
      category: 'Nombre',
      req: 'REQ-R02',
      title: 'Registro acepta nombre de 1 carácter',
      severity: 'Media',
      name: 'A',
      email: 'valido3@ejemplo.com',
      password: 'Segura2026!',
      age: '25',
      expectReject: true,
      steps: ['Ingresar nombre de 1 carácter', 'Completar campos válidos', 'Enviar'],
      data: 'Nombre: A\nEmail: valido3@ejemplo.com\nPassword: Segura2026!\nEdad: 25',
      expected: 'Debe rechazarse: mínimo 2 caracteres (REQ-R02).',
    },
    {
      id: 'email-sin-arroba',
      category: 'Email',
      req: 'REQ-R03',
      title: 'Email sin @ — comportamiento esperado (control)',
      severity: 'Baja',
      name: 'Test Tester',
      email: 'usuario.com',
      password: 'Segura2026!',
      age: '25',
      expectReject: true,
      steps: ['Ingresar email sin @', 'Enviar'],
      data: 'Email: usuario.com',
      expected: 'Debe rechazarse.',
    },
    {
      id: 'email-sin-dominio',
      category: 'Email',
      req: 'REQ-R03',
      title: "Registro acepta email 'usuario@' sin dominio",
      severity: 'Alta',
      name: 'Test Tester',
      email: 'usuario@',
      password: 'Segura2026!',
      age: '25',
      expectReject: true,
      steps: ['Ingresar email con @ pero sin dominio', 'Enviar'],
      data: 'Email: usuario@',
      expected: 'Debe rechazarse: falta dominio con punto (REQ-R03).',
    },
    {
      id: 'email-sin-punto-dominio',
      category: 'Email',
      req: 'REQ-R03',
      title: 'Registro acepta email sin punto en el dominio',
      severity: 'Alta',
      name: 'Test Tester',
      email: 'user@dominio',
      password: 'Segura2026!',
      age: '25',
      expectReject: true,
      steps: ['Ingresar email user@dominio (sin TLD)', 'Enviar'],
      data: 'Email: user@dominio',
      expected: 'Debe rechazarse: dominio debe contener punto.',
    },
    {
      id: 'password-7-chars',
      category: 'Contraseña',
      req: 'REQ-R04',
      title: 'Registro acepta contraseña de 7 caracteres',
      severity: 'Alta',
      name: 'Test Tester',
      email: 'valido4@ejemplo.com',
      password: '1234567',
      age: '25',
      expectReject: true,
      steps: ['Ingresar contraseña de 7 caracteres', 'Enviar'],
      data: 'Password: 1234567 (7 chars)',
      expected: 'Debe rechazarse: mínimo 8 caracteres (REQ-R04).',
    },
    {
      id: 'password-65-chars',
      category: 'Contraseña',
      req: 'REQ-R04',
      title: 'Registro acepta contraseña de 65 caracteres',
      severity: 'Alta',
      name: 'Test Tester',
      email: 'valido5@ejemplo.com',
      password: 'a'.repeat(65),
      age: '25',
      expectReject: true,
      steps: ['Ingresar contraseña de 65 caracteres', 'Enviar'],
      data: 'Password: "a" x 65',
      expected: 'Debe rechazarse: máximo 64 caracteres (REQ-R04).',
    },
    {
      id: 'edad-15',
      category: 'Edad',
      req: 'REQ-R05',
      title: 'Registro acepta edad 15 (menor al mínimo)',
      severity: 'Alta',
      name: 'Test Tester',
      email: 'valido6@ejemplo.com',
      password: 'Segura2026!',
      age: '15',
      expectReject: true,
      steps: ['Ingresar edad 15', 'Enviar'],
      data: 'Edad: 15',
      expected: 'Debe rechazarse: rango 16-99 (REQ-R05).',
    },
    {
      id: 'edad-100',
      category: 'Edad',
      req: 'REQ-R05',
      title: 'Registro acepta edad 100 (mayor al máximo)',
      severity: 'Alta',
      name: 'Test Tester',
      email: 'valido7@ejemplo.com',
      password: 'Segura2026!',
      age: '100',
      expectReject: true,
      steps: ['Ingresar edad 100', 'Enviar'],
      data: 'Edad: 100',
      expected: 'Debe rechazarse: rango 16-99 (REQ-R05).',
    },
    {
      id: 'edad-vacia',
      category: 'Edad',
      req: 'REQ-R01',
      title: 'Registro acepta edad vacía',
      severity: 'Alta',
      name: 'Test Tester',
      email: 'valido8@ejemplo.com',
      password: 'Segura2026!',
      age: '',
      expectReject: true,
      steps: ['Dejar edad vacía', 'Enviar'],
      data: 'Edad: (vacía)',
      expected: 'Debe rechazarse: campo obligatorio.',
    },
  ];

  for (const testCase of invalidCases) {
    if (timeLeft() <= 0) break;
    const pauseMs = Math.min(9000, Math.max(3000, timeLeft() / 18));
    await page.waitForTimeout(pauseMs);
    await runInvalidCase(page, testCase);
  }

  // 2. Cuenta válida
  if (timeLeft() > 5000) {
    const unique = Date.now();
    validAccount = {
      name: 'Mayra Exploratoria QA',
      email: `mayra.exploratorio+${unique}@ejemplo.com`,
      password: 'Segura2026!',
      age: '28',
    };

    await page.goto(`${BASE_URL}/registro`);
    await page.getByTestId('register-name').fill(validAccount.name);
    await page.getByTestId('register-email').fill(validAccount.email);
    await page.getByTestId('register-password').fill(validAccount.password);
    await page.getByTestId('register-age').fill(validAccount.age);
    await submitRegister(page);

    const successVisible = await page.getByTestId('register-success').isVisible().catch(() => false);
    if (!successVisible) {
      const evidence = await screenshot(page, 'registro-valido-fallido');
      addFinding({
        id: 'registro-valido-fallido',
        severity: 'Alta',
        req: 'REQ-R01',
        title: 'No se pudo completar un registro con datos válidos',
        steps: ['Completar todos los campos con datos válidos', 'Enviar'],
        data: JSON.stringify(validAccount, null, 2),
        expected: 'Registro exitoso.',
        actual: 'No apareció mensaje de éxito.',
        evidence,
        category: 'Flujo feliz',
      });
    } else {
      const evidenceOk = await screenshot(page, 'registro-valido-exito');
      const valuesAfterSuccess = await getRegisterState(page);

      // REQ-R06: form should clear after success
      const fieldsNotCleared =
        valuesAfterSuccess.values.name ||
        valuesAfterSuccess.values.email ||
        valuesAfterSuccess.values.password ||
        valuesAfterSuccess.values.age;

      if (fieldsNotCleared) {
        addFinding({
          id: 'formulario-no-limpia',
          severity: 'Media',
          req: 'REQ-R06',
          title: 'Tras registro exitoso el formulario conserva datos',
          steps: [
            'Registrar cuenta con datos válidos',
            'Observar campos del formulario tras el éxito',
          ],
          data: JSON.stringify(validAccount, null, 2),
          expected: 'Todos los campos deben quedar vacíos tras el éxito.',
          actual: `Valores residuales: ${JSON.stringify(valuesAfterSuccess.values)}`,
          evidence: evidenceOk,
          category: 'Post-registro',
        });
      }

      // REQ-R07: duplicate email
      if (timeLeft() > 3000) {
        await page.getByTestId('register-name').fill('Duplicado Test');
        await page.getByTestId('register-email').fill(validAccount.email);
        await page.getByTestId('register-password').fill('Segura2026!');
        await page.getByTestId('register-age').fill('30');
        await submitRegister(page);
        const dupState = await getRegisterState(page);
        if (dupState.success) {
          const evidenceDup = await screenshot(page, 'email-duplicado-aceptado');
          addFinding({
            id: 'email-duplicado',
            severity: 'Alta',
            req: 'REQ-R07',
            title: 'Permite registrar un email ya existente',
            steps: [
              'Registrar cuenta válida',
              'Intentar registrar de nuevo el mismo email',
              'Enviar',
            ],
            data: `Email duplicado: ${validAccount.email}`,
            expected: 'Debe rechazarse con error de email duplicado.',
            actual: 'El segundo registro también tuvo éxito.',
            evidence: evidenceDup,
            category: 'Email',
          });
        }
      }
    }
  }

  // 3. Login con cuenta creada
  if (validAccount && timeLeft() > 3000) {
    await page.goto(`${BASE_URL}/login`);
    const emailField = page.getByTestId('login-email').or(page.locator('input[type="email"]').first());
    const passField = page.getByTestId('login-password').or(page.locator('input[type="password"]').first());
    const submitBtn = page.getByTestId('login-submit').or(page.getByRole('button', { name: /iniciar sesión|entrar|login/i }));

    await emailField.fill(validAccount.email);
    await passField.fill(validAccount.password);
    await submitBtn.click();
    await page.waitForTimeout(1000);

    const welcome = page.getByTestId('login-welcome');
    const welcomeVisible = await welcome.isVisible().catch(() => false);
    const welcomeText = welcomeVisible ? await welcome.textContent() : '';

    if (!welcomeVisible) {
      const evidenceLogin = await screenshot(page, 'login-cuenta-creada-fallido');
      addFinding({
        id: 'login-post-registro',
        severity: 'Alta',
        req: 'REQ-L04',
        title: 'No se puede iniciar sesión con la cuenta recién creada',
        steps: ['Registrar cuenta válida', 'Ir a /login', 'Ingresar credenciales', 'Enviar'],
        data: `Email: ${validAccount.email}\nPassword: ${validAccount.password}`,
        expected: 'Mensaje de bienvenida con el nombre del usuario (login-welcome).',
        actual: 'No se detectó login-welcome tras el login.',
        evidence: evidenceLogin,
        category: 'Login',
      });
    } else {
      await screenshot(page, 'login-cuenta-creada-exito');
    }
  }

  // Casos adicionales de borde (completar ventana de ~2 min)
  const extraCases = [
    {
      id: 'nombre-51-chars',
      category: 'Nombre',
      req: 'REQ-R02',
      title: 'Registro acepta nombre de 51 caracteres',
      severity: 'Media',
      name: 'A'.repeat(51),
      email: `extra1+${Date.now()}@ejemplo.com`,
      password: 'Segura2026!',
      age: '25',
      expectReject: true,
      steps: ['Ingresar nombre de 51 caracteres', 'Enviar'],
      data: 'Nombre: 51 x "A"',
      expected: 'Debe rechazarse: máximo 50 caracteres.',
    },
    {
      id: 'password-vacia',
      category: 'Contraseña',
      req: 'REQ-R01',
      title: 'Registro acepta contraseña vacía',
      severity: 'Alta',
      name: 'Test Tester',
      email: `extra2+${Date.now()}@ejemplo.com`,
      password: '',
      age: '25',
      expectReject: true,
      steps: ['Dejar contraseña vacía', 'Enviar'],
      data: 'Password: (vacía)',
      expected: 'Debe rechazarse: campo obligatorio.',
    },
    {
      id: 'edad-16-limite',
      category: 'Edad',
      req: 'REQ-R05',
      title: 'Edad límite inferior 16 — control positivo',
      severity: 'Baja',
      name: 'Limite Edad',
      email: `extra3+${Date.now()}@ejemplo.com`,
      password: 'Segura2026!',
      age: '16',
      expectReject: false,
      expectAccept: true,
      steps: ['Ingresar edad 16 (mínimo válido)', 'Enviar'],
      data: 'Edad: 16',
      expected: 'Debe aceptarse.',
    },
    {
      id: 'edad-99-limite',
      category: 'Edad',
      req: 'REQ-R05',
      title: 'Edad límite superior 99 — control positivo',
      severity: 'Baja',
      name: 'Limite Edad Max',
      email: `extra4+${Date.now()}@ejemplo.com`,
      password: 'Segura2026!',
      age: '99',
      expectReject: false,
      expectAccept: true,
      steps: ['Ingresar edad 99 (máximo válido)', 'Enviar'],
      data: 'Edad: 99',
      expected: 'Debe aceptarse.',
    },
    {
      id: 'email-doble-arroba',
      category: 'Email',
      req: 'REQ-R03',
      title: 'Registro acepta email con doble @',
      severity: 'Media',
      name: 'Test Tester',
      email: 'user@@dominio.com',
      password: 'Segura2026!',
      age: '25',
      expectReject: true,
      steps: ['Ingresar email user@@dominio.com', 'Enviar'],
      data: 'Email: user@@dominio.com',
      expected: 'Debe rechazarse: formato inválido.',
    },
  ];

  for (const testCase of extraCases) {
    if (timeLeft() <= 0) break;
    await page.waitForTimeout(Math.min(8000, Math.max(2000, timeLeft() / (extraCases.length + 1))));
    await runInvalidCase(page, testCase);
  }

  // Completar ventana exploratoria de 2 minutos
  const remaining = timeLeft();
  if (remaining > 0) {
    await page.waitForTimeout(remaining);
  }

  const html = buildHtmlReport();
  fs.writeFileSync(path.join(OUT_DIR, 'Exploratorio-registroEstudiante.html'), html, 'utf8');
  fs.writeFileSync(
    path.join(OUT_DIR, 'Exploratorio-registroEstudiante.json'),
    JSON.stringify({ findings, validAccount, durationSeconds: elapsed() }, null, 2),
    'utf8'
  );

  await browser.close();

  console.log(`\n=== EXPLORATORIO COMPLETADO (${elapsed()}s) ===`);
  console.log(`Bugs encontrados: ${findings.length}`);
  findings.forEach((f, i) => console.log(`${i + 1}. [${f.severity}] ${f.title} (${f.req})`));
  console.log(`\nReporte HTML: ${path.join(OUT_DIR, 'Exploratorio-registroEstudiante.html')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
