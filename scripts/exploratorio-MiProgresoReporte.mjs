import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://academia-sin-humo.vercel.app';
const OUT_DIR = path.resolve('Exploratorio-MiProgresoReporte');
const EVID_DIR = path.join(OUT_DIR, 'evidencia');
const SESSION_START = Date.now();
const SESSION_DURATION_MS = 2 * 60 * 1000;
const PASSWORD = 'Segura2026!';
const COURSE = 'fundamentos';

const findings = [];
const sessionLog = [];
let screenshotIndex = 0;
let account = null;

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
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const filename = `${String(screenshotIndex).padStart(2, '0')}-${safe}.png`;
  await page.screenshot({ path: path.join(EVID_DIR, filename), fullPage: true, timeout: 15000 });
  return `evidencia/${filename}`;
}

async function reportBug(page, bug) {
  const evidence = await screenshot(page, bug.id);
  addFinding({ ...bug, evidence });
  log(`BUG: ${bug.title}`);
}

async function getProgressState(page) {
  const short = { timeout: 1500 };
  const statusEl = page.getByTestId(`status-${COURSE}`);
  const status = (await statusEl.isVisible(short).catch(() => false))
    ? await statusEl.textContent(short).catch(() => '?')
    : '(sin curso en progreso)';
  const notifEl = page.getByTestId(`notification-${COURSE}`);
  const notification = (await notifEl.isVisible(short).catch(() => false))
    ? await notifEl.textContent(short).catch(() => '')
    : '';
  const actions = await page.evaluate((courseId) => {
    return [...document.querySelectorAll(`[data-testid^="action-${courseId}"]`)].map((e) => ({
      id: e.getAttribute('data-testid'),
      text: e.textContent?.trim(),
      disabled: e.disabled,
    }));
  }, COURSE);
  return { status: status?.trim(), notification: notification?.trim(), actions };
}

async function registerAndLogin(page) {
  const unique = Date.now();
  account = {
    name: 'QA Mi Progreso',
    email: `qa.progreso+${unique}@ejemplo.com`,
    password: PASSWORD,
    age: '25',
  };
  await page.goto(`${BASE_URL}/registro`);
  await pause(page, 800);
  await page.getByTestId('register-name').fill(account.name);
  await page.getByTestId('register-email').fill(account.email);
  await page.getByTestId('register-password').fill(account.password);
  await page.getByTestId('register-age').fill(account.age);
  await page.getByTestId('register-submit').click();
  await pause(page, 1000);

  await page.goto(`${BASE_URL}/login`);
  await pause(page, 800);
  await page.getByTestId('login-email').fill(account.email);
  await page.getByTestId('login-password').fill(account.password);
  await page.getByTestId('login-submit').click();
  await page.waitForSelector('[data-testid="login-welcome"]', { timeout: 10000 });
  log(`Login exitoso con ${account.email}`);
}

async function goToProgress(page) {
  await page.getByTestId('nav-mi-progreso').click();
  await page.waitForURL('**/mi-progreso');
  await pause(page, 800);
}

async function enrollFundamentos(page) {
  await page.getByTestId('nav-cursos').click();
  await page.waitForURL('**/cursos');
  await page.waitForSelector('[data-testid="courses-title"]', { timeout: 15000 });
  await page.getByTestId('enroll-fundamentos').click();
  await pause(page, 1000);
}

async function apiProgress(page, action) {
  return page.evaluate(
    async ({ courseId, actionName }) => {
      const r = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, action: actionName }),
      });
      return { status: r.status, body: await r.text() };
    },
    { courseId: COURSE, actionName: action }
  );
}

function buildHtmlReport() {
  const bugRows = findings
    .map(
      (f, i) => `
      <article class="bug-card">
        <header>
          <span class="badge ${f.severity.toLowerCase()}">${f.severity}</span>
          <span class="badge req">${f.req}</span>
          <h2>Bug ${i + 1}: ${f.title}</h2>
          <p class="meta">${f.category} · ${f.timestamp}</p>
        </header>
        <section><h3>Pasos</h3><ol>${f.steps.map((s) => `<li>${s}</li>`).join('')}</ol></section>
        <section class="grid-2">
          <div>
            <h3>Datos / valor límite</h3><pre>${f.data}</pre>
            <h3>Esperado</h3><p>${f.expected}</p>
            <h3>Actual</h3><p class="actual">${f.actual}</p>
          </div>
          <div><h3>Evidencia</h3><a href="${f.evidence}" target="_blank"><img src="${f.evidence}" alt="${f.title}" /></a></div>
        </section>
      </article>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exploratorio-MiProgresoReporte</title>
  <style>
    :root{--bg:#0f1419;--card:#1a2332;--text:#e7ecf3;--muted:#9aa8bc;--accent:#5b9cff;--high:#ff6b6b;--media:#ffb347;--border:#2a3548;--ok:#6bcb77}
    body{margin:0;font-family:system-ui,sans-serif;background:linear-gradient(180deg,#0b1020,var(--bg));color:var(--text);line-height:1.5}
    .container{max-width:1100px;margin:0 auto;padding:2rem 1.25rem 4rem}
    header.hero{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:2rem;margin-bottom:2rem}
    .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin:1.5rem 0}
    .stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1rem}
    .stat strong{display:block;font-size:2rem;color:var(--accent)}
    .stat span{color:var(--muted);font-size:.85rem}
    .scope{background:rgba(91,156,255,.08);border-left:4px solid var(--accent);padding:1rem 1.25rem;border-radius:0 10px 10px 0;margin-bottom:1.5rem}
    .bug-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1.5rem;margin-bottom:1.5rem}
    .badge{display:inline-block;padding:.2rem .55rem;border-radius:999px;font-size:.75rem;font-weight:700;margin-right:.35rem;text-transform:uppercase}
    .badge.alta{background:rgba(255,107,107,.18);color:var(--high)}
    .badge.media{background:rgba(255,179,71,.18);color:var(--media)}
    .badge.req{background:rgba(91,156,255,.15);color:var(--accent)}
    .meta{color:var(--muted);font-size:.9rem}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem}
    @media(max-width:800px){.grid-2{grid-template-columns:1fr}}
    pre{background:#101826;border:1px solid var(--border);border-radius:8px;padding:.75rem;white-space:pre-wrap;font-size:.85rem}
    .actual{color:var(--high);font-weight:600}
    img{width:100%;border-radius:10px;border:1px solid var(--border)}
    .log{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1rem;font-size:.85rem;max-height:300px;overflow:auto}
    .log li{margin:.3rem 0;color:var(--muted);font-family:monospace}
    .pass{color:var(--ok)}
  </style>
</head>
<body>
  <div class="container">
    <header class="hero">
      <h1>Exploratorio-MiProgresoReporte</h1>
      <p class="subtitle">Progreso del estudiante · REQ-P01 a REQ-P05 · ${new Date().toLocaleString('es-ES')}</p>
      <p class="subtitle">Modo visible · Valores límite en transiciones de estado</p>
    </header>
    <div class="summary">
      <div class="stat"><strong>${findings.length}</strong><span>Bugs</span></div>
      <div class="stat"><strong>120s</strong><span>Duración</span></div>
      <div class="stat"><strong>${screenshotIndex}</strong><span>Capturas</span></div>
      <div class="stat"><strong class="pass">${account ? 'OK' : '—'}</strong><span>Login + progreso</span></div>
    </div>
    <section class="scope">
      <h3>Alcance</h3>
      <ul>
        <li>Empezar a practicar → registro → login → Mi progreso → Catálogo</li>
        <li>Transiciones válidas e inválidas (Inscrito, En progreso, Completado, Certificado, Abandonado)</li>
        <li>Valores límite: transiciones terminales (Abandonado, Certificado), certificado duplicado</li>
      </ul>
      ${account ? `<p class="pass">Cuenta: <code>${account.email}</code></p>` : ''}
    </section>
    <h2>Hallazgos</h2>
    ${findings.length ? bugRows : '<p>Sin bugs detectados.</p>'}
    <h2>Log de sesión</h2>
    <ul class="log">${sessionLog.map((l) => `<li>${l}</li>`).join('')}</ul>
  </div>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(EVID_DIR, { recursive: true });

  log('Lanzando Chromium visible (headless: false, slowMo: 250)...');
  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. Home → Empezar a practicar
  log('Home → Empezar a practicar');
  await page.goto(BASE_URL);
  await pause(page, 1500);
  await screenshot(page, 'home');
  await page.getByRole('link', { name: /Empezar a practicar/i }).first().click();
  await page.waitForURL('**/registro');
  await pause(page, 1000);

  // 2. Login con cuenta creada
  log('FASE A — Registro e inicio de sesión');
  await registerAndLogin(page);
  await screenshot(page, 'login-exitoso');

  // 3. Mi progreso vacío
  log('FASE B — Mi progreso (sin cursos)');
  await goToProgress(page);
  const emptyVisible = await page.getByTestId('empty-progress').isVisible().catch(() => false);
  log(`Estado vacío visible: ${emptyVisible}`);
  await screenshot(page, 'progreso-vacio');

  // 4. Inscribir y ver progreso
  log('FASE C — Inscripción y catálogo');
  await enrollFundamentos(page);
  await screenshot(page, 'catalogo-inscripcion');
  await goToProgress(page);
  let state = await getProgressState(page);
  log(`Estado inicial: ${state.status}`);
  await screenshot(page, 'progreso-inscrito');

  // REQ-P03 valor límite: Inscrito → Completado (inválida)
  log('FASE D — Transición inválida Inscrito → Completado (control)');
  await page.getByTestId(`action-${COURSE}-completar`).click();
  await pause(page, 1000);
  state = await getProgressState(page);
  log(`Tras Completar desde Inscrito: status=${state.status} notif=${state.notification}`);
  if (state.status !== 'Inscrito') {
    await reportBug(page, {
      id: 'inscrito-a-completado',
      severity: 'Alta',
      req: 'REQ-P03',
      category: 'Transiciones',
      title: 'Transición inválida Inscrito → Completado permitida en UI',
      steps: ['Inscribirse en Fundamentos', 'Clic en Completar sin Comenzar'],
      data: 'Valor límite: salto Inscrito → Completado',
      expected: 'Estado permanece Inscrito con mensaje de error.',
      actual: `Estado: ${state.status}`,
    });
  } else {
    await screenshot(page, 'transicion-invalida-rechazada');
  }

  // Flujo parcial: Comenzar (En progreso)
  log('FASE E — Comenzar curso (Inscrito → En progreso)');
  await page.getByTestId(`action-${COURSE}-comenzar`).click();
  await pause(page, 800);
  state = await getProgressState(page);
  log(`Tras Comenzar: ${state.status}`);
  await screenshot(page, 'progreso-en-progreso');

  // REQ-P03: Abandonado → En progreso (UI Retomar) — antes de completar
  log('FASE F — Valor límite: Abandonado → En progreso (UI Retomar)');
  await page.getByTestId(`action-${COURSE}-abandonar`).click();
  await pause(page, 1000);
  state = await getProgressState(page);
  log(`Tras Abandonar: ${state.status}`);
  await screenshot(page, 'estado-abandonado');

  if (state.status === 'Abandonado') {
    const retomarVisible = await page.getByTestId(`action-${COURSE}-retomar`).isVisible().catch(() => false);
    if (retomarVisible) {
      await page.getByTestId(`action-${COURSE}-retomar`).click();
      await pause(page, 1000);
      state = await getProgressState(page);
      log(`Tras Retomar: ${state.status}`);
      if (state.status === 'En progreso') {
        await reportBug(page, {
          id: 'abandonado-retomar-ui',
          severity: 'Alta',
          req: 'REQ-P03',
          category: 'Transiciones',
          title: 'Estado terminal Abandonado permite Retomar → En progreso',
          steps: ['Comenzar curso', 'Abandonar', 'Clic en Retomar'],
          data: 'Valor límite: transición desde Abandonado (estado terminal)',
          expected: 'Abandonado sin transiciones. Retomar rechazado.',
          actual: `Estado tras Retomar: ${state.status}`,
        });
      }
    }
  }

  // API retomar desde Abandonado (sesión API limpia)
  if (timeLeft() > 15000) {
    log('FASE F.2 — API retomar desde Abandonado');
    await page.evaluate(async () => {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'fundamentos', action: 'abandonar' }),
      });
    });
    const apiRetomar = await apiProgress(page, 'retomar');
    log(`API retomar: ${apiRetomar.status}`);
    if (apiRetomar.status === 200 && apiRetomar.body.includes('en-progreso')) {
      await goToProgress(page);
      await reportBug(page, {
        id: 'abandonado-retomar-api',
        severity: 'Alta',
        req: 'REQ-P03',
        category: 'API / Transiciones',
        title: 'API acepta retomar curso en estado Abandonado',
        steps: ['Abandonar vía API', 'POST action=retomar'],
        data: 'Valor límite: Abandonado → en-progreso vía API',
        expected: 'HTTP 422 transición inválida.',
        actual: apiRetomar.body.slice(0, 220),
      });
    }
  }

  // Continuar flujo válido hasta Certificado
  log('FASE G — Flujo válido: Completar → Certificar');
  await goToProgress(page);
  if (state.status !== 'En progreso') {
    await page.getByTestId(`action-${COURSE}-comenzar`).click().catch(() => {});
    await pause(page, 600);
  }
  await page.getByTestId(`action-${COURSE}-completar`).click();
  await pause(page, 800);
  state = await getProgressState(page);
  log(`Tras Completar: ${state.status}`);
  await page.getByTestId(`action-${COURSE}-certificar`).click();
  await pause(page, 800);
  state = await getProgressState(page);
  log(`Tras Certificar: ${state.status}`);
  await screenshot(page, 'progreso-certificado');

  // REQ-P04 valor límite: 2º certificado
  log('FASE H — Valor límite REQ-P04: certificar duplicado');
  const cert1 = await apiProgress(page, 'certificar');
  log(`2º certificar API: ${cert1.status} certificates=${JSON.parse(cert1.body).certificates}`);
  if (cert1.status === 200) {
    const body = JSON.parse(cert1.body);
    if (body.certificates > 1) {
      await reportBug(page, {
        id: 'certificados-duplicados',
        severity: 'Alta',
        req: 'REQ-P04',
        category: 'Certificación',
        title: 'Múltiples clics en Certificar generan certificados duplicados',
        steps: [
          'Completar flujo hasta Certificado',
          'POST /api/progress action=certificar por segunda vez',
        ],
        data: `Valor límite: 2ª certificación\ncertificates=${body.certificates}`,
        expected: 'Un solo certificado por curso (certificates=1).',
        actual: `HTTP 200, certificates=${body.certificates}, mensaje: ${body.message}`,
      });
    }
  }

  // REQ-P03: Certificado → En progreso (terminal → inválida)
  log('FASE I — Valor límite: Certificado → En progreso (API comenzar)');
  const certToProgress = await apiProgress(page, 'comenzar');
  log(`comenzar desde Certificado: ${certToProgress.status}`);
  if (certToProgress.status === 200 && certToProgress.body.includes('en-progreso')) {
    await goToProgress(page);
    await reportBug(page, {
      id: 'certificado-a-en-progreso',
      severity: 'Alta',
      req: 'REQ-P03',
      category: 'Transiciones',
      title: 'Estado terminal Certificado permite volver a En progreso',
      steps: [
        'Llevar curso a Certificado',
        'POST /api/progress action=comenzar',
        'Revisar Mi progreso',
      ],
      data: 'Valor límite: transición desde estado final Certificado',
      expected: 'Rechazado: Certificado no tiene transiciones permitidas.',
      actual: certToProgress.body.slice(0, 200),
    });
  }

  // REQ-P05: catálogo tras completar
  if (timeLeft() > 5000) {
    log('FASE J — Catálogo tras completar (REQ-P05)');
    await page.getByTestId('nav-cursos').click();
    await page.waitForURL('**/cursos');
    await pause(page, 800);
    const short = { timeout: 1500 };
    const pwLocked = await page.getByTestId('locked-playwright-cero').isVisible(short).catch(() => false);
    const pwBtn = await page.getByTestId('enroll-playwright-cero').textContent(short).catch(() => '');
    log(`Playwright desde cero: locked=${pwLocked} btn=${pwBtn}`);
    if (pwLocked) {
      await reportBug(page, {
        id: 'catalogo-no-desbloquea',
        severity: 'Alta',
        req: 'REQ-P05',
        category: 'Catálogo',
        title: 'Completar Fundamentos no desbloquea cursos dependientes',
        steps: ['Completar/certificar Fundamentos', 'Ir al catálogo'],
        data: 'Prerequisito Fundamentos completado',
        expected: 'playwright-cero desbloqueado.',
        actual: `locked=${pwLocked}, botón=${pwBtn}`,
      });
    } else {
      await screenshot(page, 'catalogo-desbloqueado-req-p05');
    }
  }

  const remaining = timeLeft();
  if (remaining > 0) {
    log(`Completando ventana de 2 min (${(remaining / 1000).toFixed(0)}s)...`);
    await page.waitForTimeout(remaining);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'Exploratorio-MiProgresoReporte.html'), buildHtmlReport(), 'utf8');
  fs.writeFileSync(
    path.join(OUT_DIR, 'Exploratorio-MiProgresoReporte.json'),
    JSON.stringify({ findings, account, sessionLog, durationSeconds: elapsed() }, null, 2),
    'utf8'
  );

  log('Cerrando navegador en 3s...');
  await page.waitForTimeout(3000);
  await browser.close();

  console.log(`\nReporte: ${path.join(OUT_DIR, 'Exploratorio-MiProgresoReporte.html')}`);
  console.log(`Bugs: ${findings.length}`);
  findings.forEach((f, i) => console.log(`  ${i + 1}. [${f.severity}] ${f.title}`));
}

main().catch(async (err) => {
  console.error(err);
  try {
    fs.mkdirSync(EVID_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'Exploratorio-MiProgresoReporte.html'), buildHtmlReport(), 'utf8');
  } catch (_) {}
  process.exit(1);
});
