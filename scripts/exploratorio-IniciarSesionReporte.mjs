import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://academia-sin-humo.vercel.app';
const OUT_DIR = path.resolve('Exploratorio-IniciarSesionReporte');
const EVID_DIR = path.join(OUT_DIR, 'evidencia');
const SESSION_START = Date.now();
const SESSION_DURATION_MS = 2 * 60 * 1000;
const DEMO_EMAIL = 'ana.garcia@ejemplo.com';
const DEMO_PASSWORD = 'Segura2026!';

const findings = [];
const sessionLog = [];
let screenshotIndex = 0;
let validAccount = null;

function elapsed() {
  return ((Date.now() - SESSION_START) / 1000).toFixed(1);
}

function timeLeft() {
  return SESSION_DURATION_MS - (Date.now() - SESSION_START);
}

function log(msg) {
  const line = `[${elapsed()}s] ${msg}`;
  sessionLog.push(line);
  console.log(line);
}

function addFinding(bug) {
  findings.push({ ...bug, timestamp: elapsed() + 's' });
}

async function pause(page, ms = 1200) {
  const wait = Math.min(ms, Math.max(400, timeLeft() - 500));
  if (wait > 0) await page.waitForTimeout(wait);
}

async function screenshot(page, label) {
  screenshotIndex += 1;
  const safe = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const filename = `${String(screenshotIndex).padStart(2, '0')}-${safe}.png`;
  await page.screenshot({ path: path.join(EVID_DIR, filename), fullPage: true });
  return `evidencia/${filename}`;
}

async function getLoginState(page) {
  const welcome = await page.getByTestId('login-welcome').isVisible().catch(() => false);
  const error = await page.getByTestId('login-error').isVisible().catch(() => false);
  const errorText = error ? await page.getByTestId('login-error').textContent().catch(() => '') : '';
  const lockout = await page.getByTestId('login-lockout').isVisible().catch(() => false);
  const lockoutText = lockout ? await page.getByTestId('login-lockout').textContent().catch(() => '') : '';
  const timer = await page.getByTestId('login-timer').isVisible().catch(() => false);
  const timerText = timer ? await page.getByTestId('login-timer').textContent().catch(() => '') : '';
  const submitVisible = await page.getByTestId('login-submit').isVisible().catch(() => false);
  const submitDisabled = submitVisible ? await page.getByTestId('login-submit').isDisabled().catch(() => false) : null;
  const submitText = submitVisible ? await page.getByTestId('login-submit').textContent().catch(() => '') : '(formulario no visible)';
  return { welcome, error, errorText, lockout, lockoutText, timer, timerText, submitDisabled, submitText, submitVisible };
}

async function fillLogin(page, email, password) {
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
}

async function submitLogin(page) {
  await page.getByTestId('login-submit').click();
  await page.waitForTimeout(700);
}

async function reportBug(page, bug) {
  const evidence = await screenshot(page, bug.id);
  addFinding({ ...bug, evidence });
  log(`BUG: ${bug.title}`);
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
          <p class="meta">${f.category} · ${f.timestamp}</p>
        </header>
        <section>
          <h3>Pasos para reproducir</h3>
          <ol>${f.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
        </section>
        <section class="grid-2">
          <div>
            <h3>Datos de prueba (valores límite)</h3>
            <pre>${f.data}</pre>
            <h3>Esperado</h3>
            <p>${f.expected}</p>
            <h3>Actual</h3>
            <p class="actual">${f.actual}</p>
          </div>
          <div>
            <h3>Evidencia</h3>
            <a href="${f.evidence}" target="_blank">
              <img src="${f.evidence}" alt="${f.title}" loading="lazy" />
            </a>
          </div>
        </section>
      </article>`
    )
    .join('\n');

  const logHtml = sessionLog.map((l) => `<li>${l}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exploratorio — Inicio de sesión</title>
  <style>
    :root { --bg:#0f1419; --card:#1a2332; --text:#e7ecf3; --muted:#9aa8bc; --accent:#5b9cff;
      --high:#ff6b6b; --media:#ffb347; --ok:#6bcb77; --border:#2a3548; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; background:linear-gradient(180deg,#0b1020,var(--bg)); color:var(--text); line-height:1.5; }
    .container { max-width:1100px; margin:0 auto; padding:2rem 1.25rem 4rem; }
    header.hero { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:2rem; margin-bottom:2rem; }
    h1 { margin:0 0 .5rem; }
    .subtitle { color:var(--muted); margin:.25rem 0; }
    .summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1rem; margin:1.5rem 0; }
    .stat { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:1rem; }
    .stat strong { display:block; font-size:2rem; color:var(--accent); }
    .stat span { color:var(--muted); font-size:.85rem; }
    .scope { background:rgba(91,156,255,.08); border-left:4px solid var(--accent); padding:1rem 1.25rem; border-radius:0 10px 10px 0; margin-bottom:1.5rem; }
    .bug-card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:1.5rem; margin-bottom:1.5rem; }
    .badge { display:inline-block; padding:.2rem .55rem; border-radius:999px; font-size:.75rem; font-weight:700; margin-right:.35rem; text-transform:uppercase; }
    .badge.alta { background:rgba(255,107,107,.18); color:var(--high); }
    .badge.media { background:rgba(255,179,71,.18); color:var(--media); }
    .badge.req { background:rgba(91,156,255,.15); color:var(--accent); }
    .meta { color:var(--muted); font-size:.9rem; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:1.25rem; }
    @media (max-width:800px) { .grid-2 { grid-template-columns:1fr; } }
    pre { background:#101826; border:1px solid var(--border); border-radius:8px; padding:.75rem; white-space:pre-wrap; font-size:.85rem; }
    .actual { color:var(--high); font-weight:600; }
    img { width:100%; border-radius:10px; border:1px solid var(--border); }
    .log { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:1rem 1.25rem; font-size:.85rem; max-height:320px; overflow:auto; }
    .log li { margin:.35rem 0; color:var(--muted); font-family:monospace; }
    .pass { color:var(--ok); }
  </style>
</head>
<body>
  <div class="container">
    <header class="hero">
      <h1>Exploratorio-IniciarSesionReporte</h1>
      <p class="subtitle">Academia sin Humo · Login · ${new Date().toLocaleString('es-ES')}</p>
      <p class="subtitle">Referencia: REQ-L01 a REQ-L04 · Técnica: valores límite · Modo: navegador visible</p>
    </header>
    <div class="summary">
      <div class="stat"><strong>${findings.length}</strong><span>Bugs</span></div>
      <div class="stat"><strong>120s</strong><span>Duración</span></div>
      <div class="stat"><strong>${screenshotIndex}</strong><span>Capturas</span></div>
      <div class="stat"><strong class="pass">${validAccount ? 'OK' : '—'}</strong><span>Registro + login</span></div>
    </div>
    <section class="scope">
      <h3>Alcance</h3>
      <ul>
        <li>Inicio → <em>Empezar a practicar</em> → flujo login/registro</li>
        <li>Login fallido: campos vacíos, credenciales inválidas, email inexistente, rate limiting (límite 5 intentos / bloqueo 30s)</li>
        <li>Registro válido + login exitoso con cuenta creada</li>
      </ul>
      ${validAccount ? `<p class="pass">Cuenta creada: <code>${validAccount.email}</code></p>` : ''}
    </section>
    <h2>Hallazgos</h2>
    ${findings.length ? bugRows : '<p>Sin bugs detectados en esta sesión.</p>'}
    <h2>Log de sesión exploratoria</h2>
    <ul class="log">${logHtml}</ul>
  </div>
</body>
</html>`;
}

async function goToLogin(page) {
  await page.goto(`${BASE_URL}/login`);
  await pause(page, 800);
}

async function main() {
  fs.mkdirSync(EVID_DIR, { recursive: true });

  log('Lanzando Chromium en modo visible (headless: false)...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 250,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. Inicio → Empezar a practicar
  log('Navegando a la home...');
  await page.goto(BASE_URL);
  await pause(page, 1500);
  await screenshot(page, 'home-inicio');
  log('Click en "Empezar a practicar"...');
  await page.getByRole('link', { name: /Empezar a practicar/i }).first().click();
  await page.waitForURL('**/registro');
  await pause(page, 1200);
  await screenshot(page, 'registro-desde-empezar');

  // Ir a login desde el playground
  log('Navegando a Iniciar sesión...');
  await page.getByTestId('nav-login').click();
  await page.waitForURL('**/login');
  await pause(page, 1000);
  await screenshot(page, 'login-inicial');

  // --- FASE A: Login no exitoso (valores límite) ---
  log('FASE A — Login no exitoso');

  // REQ-L01: campos vacíos
  await fillLogin(page, '', '');
  await submitLogin(page);
  let state = await getLoginState(page);
  log(`Campos vacíos → error:${state.error} welcome:${state.welcome}`);
  if (!state.error && !state.welcome) {
    await reportBug(page, {
      id: 'campos-vacios-sin-error',
      severity: 'Alta',
      req: 'REQ-L01',
      category: 'Campos obligatorios',
      title: 'Login permite enviar con email y contraseña vacíos sin feedback',
      steps: ['Ir a /login', 'Dejar email y contraseña vacíos', 'Clic en Iniciar sesión'],
      data: 'Email: (vacío)\nPassword: (vacío)',
      expected: 'Debe mostrar error de campos obligatorios.',
      actual: 'No se mostró login-error ni login-welcome.',
    });
  } else if (state.welcome) {
    await reportBug(page, {
      id: 'campos-vacios-login-exitoso',
      severity: 'Alta',
      req: 'REQ-L01',
      category: 'Campos obligatorios',
      title: 'Login exitoso con campos vacíos',
      steps: ['Dejar campos vacíos', 'Enviar formulario'],
      data: 'Email y password vacíos',
      expected: 'Rechazo.',
      actual: 'Apareció mensaje de bienvenida.',
    });
  } else {
    await screenshot(page, 'login-campos-vacios-rechazado');
  }
  await pause(page);

  // REQ-L02: email no registrado
  await goToLogin(page);
  await fillLogin(page, `noexiste+${Date.now()}@ejemplo.com`, 'Segura2026!');
  await submitLogin(page);
  state = await getLoginState(page);
  log(`Email no registrado → error: ${state.errorText}`);
  if (!state.error) {
    await reportBug(page, {
      id: 'email-no-registrado-sin-error',
      severity: 'Alta',
      req: 'REQ-L02',
      category: 'Credenciales',
      title: 'Email no registrado no muestra error',
      steps: ['Ingresar email inexistente', 'Enviar'],
      data: 'Email: no registrado\nPassword: Segura2026!',
      expected: 'Mensaje "Email o contraseña incorrectos".',
      actual: `Error visible: ${state.error}. Welcome: ${state.welcome}`,
    });
  }
  await pause(page);

  // REQ-L02: contraseña incorrecta (1 intento)
  await goToLogin(page);
  await fillLogin(page, DEMO_EMAIL, 'Incorrecta1');
  await submitLogin(page);
  state = await getLoginState(page);
  log(`Password incorrecta (1er intento) → ${state.errorText}`);
  await screenshot(page, 'login-password-incorrecta');
  await pause(page);

  // REQ-L03: rate limiting — contexto limpio para contar intentos desde cero
  log('FASE A.2 — Rate limiting (valores límite: intentos 1 a 5, contexto limpio)');
  const rateLimitContext = await browser.newContext();
  const ratePage = await rateLimitContext.newPage();
  await ratePage.goto(`${BASE_URL}/login`);
  await pause(ratePage, 1000);
  const attemptStates = [];
  for (let attempt = 1; attempt <= 5 && timeLeft() > 15000; attempt++) {
    await fillLogin(ratePage, DEMO_EMAIL, `wrong-${attempt}-${Date.now()}`);
    await submitLogin(ratePage);
    state = await getLoginState(ratePage);
    attemptStates.push({ attempt, ...state });
    log(`Intento fallido #${attempt}: lockout=${state.lockout} disabled=${state.submitDisabled} btn="${state.submitText}"`);
    if (state.lockout) await screenshot(ratePage, `rate-limit-intento-${attempt}`);
    await pause(ratePage, 600);
  }

  const lockoutAttempt = attemptStates.find((a) => a.lockout || a.submitDisabled === true || a.errorText?.includes('bloqueada'));
  if (lockoutAttempt && lockoutAttempt.attempt < 5) {
    await reportBug(ratePage, {
      id: 'rate-limit-antes-de-5',
      severity: 'Alta',
      req: 'REQ-L03',
      category: 'Rate limiting',
      title: `Bloqueo activado en el intento ${lockoutAttempt.attempt} (esperado: después del 5º)`,
      steps: [
        'Usar cuenta demo ana.garcia@ejemplo.com',
        'Enviar contraseñas incorrectas consecutivamente',
        'Observar en qué intento aparece el bloqueo',
      ],
      data: `Intentos hasta bloqueo: ${lockoutAttempt.attempt}\nLímite spec: 5 intentos`,
      expected: 'Bloqueo tras exactamente 5 intentos fallidos consecutivos.',
      actual: `Bloqueo detectado en intento #${lockoutAttempt.attempt}. Error: "${lockoutAttempt.errorText || lockoutAttempt.lockoutText}"`,
    });
  } else if (lockoutAttempt && lockoutAttempt.attempt > 5) {
    await reportBug(ratePage, {
      id: 'rate-limit-despues-de-5',
      severity: 'Alta',
      req: 'REQ-L03',
      category: 'Rate limiting',
      title: 'Bloqueo no aparece tras 5 intentos fallidos',
      steps: ['5 intentos fallidos consecutivos', 'Observar bloqueo'],
      data: '5 contraseñas incorrectas',
      expected: 'Bloqueo al 5º intento.',
      actual: `Primer bloqueo en intento #${lockoutAttempt?.attempt ?? 'N/A'}`,
    });
  }

  // REQ-L03: botón deshabilitado durante bloqueo
  // REQ-L03: botón debe permanecer deshabilitado mientras lockout activo
  const enabledDuringLockout = attemptStates.filter((a) => a.lockout && a.submitDisabled === false);
  if (enabledDuringLockout.length > 0) {
    const sample = enabledDuringLockout[0];
    await reportBug(ratePage, {
      id: 'boton-habilitado-durante-lockout',
      severity: 'Alta',
      req: 'REQ-L03',
      category: 'Rate limiting',
      title: 'Botón se habilita mientras el bloqueo sigue activo',
      steps: [
        'Provocar bloqueo por intentos fallidos',
        'Observar login-lockout y estado del botón en intentos siguientes',
      ],
      data: `Intentos con lockout activo y botón habilitado: ${enabledDuringLockout.map((a) => a.attempt).join(', ')}`,
      expected: 'login-submit deshabilitado durante todo el periodo de bloqueo (30s).',
      actual: `En intento #${sample.attempt} lockout visible pero botón="${sample.submitText}" habilitado.`,
    });
  }

  const duringLockout = attemptStates.find((a) => a.lockout);

  // REQ-L03: timer visual
  if (duringLockout && !duringLockout.timer && duringLockout.lockout) {
    const hasSecondsInLockout = /\d+\s*segundo/i.test(duringLockout.lockoutText || '');
    if (!hasSecondsInLockout) {
      await reportBug(ratePage, {
        id: 'sin-timer-visual',
        severity: 'Media',
        req: 'REQ-L03',
        category: 'Rate limiting',
        title: 'No hay timer visual con segundos restantes',
        steps: ['Provocar bloqueo', 'Buscar login-timer o contador'],
        data: `Lockout text: ${duringLockout.lockoutText}`,
        expected: 'Timer visual con segundos restantes (login-timer o equivalente).',
        actual: 'login-timer no visible; login-lockout sin segundos claros.',
      });
    }
  }

  await screenshot(ratePage, 'rate-limit-estado');
  await rateLimitContext.close();
  await pause(page, 1500);

  // --- FASE B: Crear cuenta válida ---
  if (timeLeft() > 20000) {
    log('FASE B — Registro con datos correctos');
    const unique = Date.now();
    validAccount = {
      name: 'QA Login Exploratorio',
      email: `qa.login+${unique}@ejemplo.com`,
      password: DEMO_PASSWORD,
      age: '25',
    };
    await page.goto(`${BASE_URL}/registro`);
    await pause(page, 1000);
    await page.getByTestId('register-name').fill(validAccount.name);
    await page.getByTestId('register-email').fill(validAccount.email);
    await page.getByTestId('register-password').fill(validAccount.password);
    await page.getByTestId('register-age').fill(validAccount.age);
    await page.getByTestId('register-submit').click();
    await pause(page, 1000);
    const regOk = await page.getByTestId('register-success').isVisible().catch(() => false);
    log(`Registro válido → éxito: ${regOk}`);
    await screenshot(page, 'registro-cuenta-valida');
    if (!regOk) {
      await reportBug(page, {
        id: 'registro-valido-fallido',
        severity: 'Alta',
        req: 'REQ-R01',
        category: 'Registro',
        title: 'No se pudo registrar cuenta válida antes del login',
        steps: ['Completar registro con datos válidos'],
        data: JSON.stringify(validAccount, null, 2),
        expected: 'register-success visible.',
        actual: 'Registro fallido.',
      });
    }
  }

  // --- FASE C: Login exitoso con cuenta creada ---
  if (validAccount && timeLeft() > 10000) {
    log('FASE C — Login exitoso con cuenta creada');
    await goToLogin(page);
    await fillLogin(page, validAccount.email, validAccount.password);
    await submitLogin(page);
    state = await getLoginState(page);
    log(`Login cuenta nueva → welcome: ${state.welcome}`);
    if (!state.welcome) {
      await reportBug(page, {
        id: 'login-cuenta-nueva-fallido',
        severity: 'Alta',
        req: 'REQ-L04',
        category: 'Login exitoso',
        title: 'No se puede iniciar sesión con la cuenta recién creada',
        steps: ['Registrar cuenta', 'Ir a login', 'Credenciales correctas'],
        data: `Email: ${validAccount.email}\nPassword: ${validAccount.password}`,
        expected: 'login-welcome con nombre del usuario.',
        actual: `Welcome: ${state.welcome}. Error: ${state.errorText}`,
      });
    } else {
      const welcomeText = await page.getByTestId('login-welcome').textContent();
      await screenshot(page, 'login-exitoso-cuenta-creada');
      log(`Bienvenida: ${welcomeText?.trim()}`);
      if (!welcomeText?.includes(validAccount.name.split(' ')[0])) {
        await reportBug(page, {
          id: 'welcome-sin-nombre',
          severity: 'Media',
          req: 'REQ-L04',
          category: 'Login exitoso',
          title: 'Mensaje de bienvenida no incluye el nombre registrado',
          steps: ['Login exitoso', 'Leer login-welcome'],
          data: `Nombre: ${validAccount.name}`,
          expected: `Bienvenida con "${validAccount.name}".`,
          actual: `Texto: "${welcomeText?.trim()}"`,
        });
      }
    }
  }

  // Login exitoso con cuenta demo (control)
  if (timeLeft() > 8000) {
    log('Control — Login exitoso cuenta demo');
    await page.getByTestId('logout-button').click().catch(async () => {
      await goToLogin(page);
    });
    await pause(page, 800);
    await goToLogin(page);
    await fillLogin(page, DEMO_EMAIL, DEMO_PASSWORD);
    await submitLogin(page);
    state = await getLoginState(page);
    if (state.welcome) {
      await screenshot(page, 'login-exitoso-demo');
      log('Login demo OK');
    }
    await pause(page);
  }

  // Completar ventana de 2 minutos
  const remaining = timeLeft();
  if (remaining > 0) {
    log(`Esperando ${(remaining / 1000).toFixed(0)}s para completar sesión de 2 minutos...`);
    await page.waitForTimeout(remaining);
  }

  const html = buildHtmlReport();
  fs.writeFileSync(path.join(OUT_DIR, 'Exploratorio-IniciarSesionReporte.html'), html, 'utf8');
  fs.writeFileSync(
    path.join(OUT_DIR, 'Exploratorio-IniciarSesionReporte.json'),
    JSON.stringify({ findings, validAccount, sessionLog, durationSeconds: elapsed() }, null, 2),
    'utf8'
  );

  log('Sesión finalizada. Cerrando navegador en 3s...');
  await page.waitForTimeout(3000);
  await browser.close();

  console.log(`\nReporte: ${path.join(OUT_DIR, 'Exploratorio-IniciarSesionReporte.html')}`);
  console.log(`Bugs: ${findings.length}`);
  findings.forEach((f, i) => console.log(`  ${i + 1}. [${f.severity}] ${f.title}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
