import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://academia-sin-humo.vercel.app';
const OUT_DIR = path.resolve('Exploratorio-VerCursosReporte');
const EVID_DIR = path.join(OUT_DIR, 'evidencia');
const SESSION_START = Date.now();
const SESSION_DURATION_MS = 2 * 60 * 1000;
const PASSWORD = 'Segura2026!';

const COURSES = [
  { id: 'fundamentos', name: 'Fundamentos de Testing', prereq: null },
  { id: 'playwright-cero', name: 'Playwright desde cero', prereq: 'fundamentos' },
  { id: 'diseno-casos', name: 'Diseño de casos de prueba', prereq: 'fundamentos' },
  { id: 'api-testing', name: 'API Testing con Playwright', prereq: 'playwright-cero' },
  { id: 'ci-cd-qa', name: 'CI/CD para QA', prereq: 'playwright-cero' },
  { id: 'liderazgo-qa', name: 'Liderazgo QA', prereq: 'diseno-casos' },
  { id: 'playwright-cazador-bugs', name: 'Automatización con Playwright', prereq: 'playwright-cero' },
  { id: 'ia-para-qa', name: 'IA aplicada al testing', prereq: 'playwright-cazador-bugs' },
  { id: 'api-cazador-bugs', name: 'API Testing (cazador bugs)', prereq: 'ia-para-qa' },
];

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
  await page.screenshot({ path: path.join(EVID_DIR, filename), fullPage: true });
  return `evidencia/${filename}`;
}

async function reportBug(page, bug) {
  const evidence = await screenshot(page, bug.id);
  addFinding({ ...bug, evidence });
  log(`BUG: ${bug.title}`);
}

async function getCourseState(page, courseId) {
  const short = { timeout: 800 };
  const spots = await page.getByTestId(`spots-${courseId}`).textContent(short).catch(() => 'N/A');
  const enrollText = await page.getByTestId(`enroll-${courseId}`).textContent(short).catch(() => 'N/A');
  const enrollDisabled = await page.getByTestId(`enroll-${courseId}`).isDisabled(short).catch(() => null);
  const lockedVisible = await page.getByTestId(`locked-${courseId}`).isVisible(short).catch(() => false);
  const badgeEl = page.getByTestId(`badge-${courseId}`);
  const badge = (await badgeEl.isVisible(short).catch(() => false))
    ? await badgeEl.textContent(short).catch(() => '')
    : '';
  const statusEl = page.getByTestId(`status-${courseId}`);
  const status = (await statusEl.isVisible(short).catch(() => false))
    ? await statusEl.textContent(short).catch(() => '')
    : '';
  const cardText = await page.getByTestId(`course-${courseId}`).textContent(short).catch(() => '');
  return { spots, enrollText, enrollDisabled, lockedVisible, badge, status, cardText };
}

async function registerAndLogin(page) {
  const unique = Date.now();
  account = {
    name: 'QA Ver Cursos',
    email: `qa.vercursos+${unique}@ejemplo.com`,
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
  await pause(page, 1000);
  const welcome = await page.getByTestId('login-welcome').textContent().catch(() => '');
  log(`Login exitoso: ${welcome?.trim()}`);
}

async function goToCatalog(page) {
  await page.getByTestId('nav-cursos').click();
  await page.waitForURL('**/cursos');
  await page.waitForSelector('[data-testid="courses-title"]', { timeout: 15000 });
  await pause(page, 800);
}

function parseSpots(spotsText) {
  const m = spotsText?.match(/(\d+)\s*disponible/i);
  return m ? Number(m[1]) : spotsText?.includes('Sin cupos') ? 0 : null;
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
  <title>Exploratorio-VerCursosReporte</title>
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
      <h1>Exploratorio-VerCursosReporte</h1>
      <p class="subtitle">Catálogo e inscripción · REQ-C01 a REQ-C06 · ${new Date().toLocaleString('es-ES')}</p>
      <p class="subtitle">Modo visible · Valores límite (cupos 0/1, prerequisitos, desbloqueo)</p>
    </header>
    <div class="summary">
      <div class="stat"><strong>${findings.length}</strong><span>Bugs</span></div>
      <div class="stat"><strong>120s</strong><span>Duración</span></div>
      <div class="stat"><strong>${screenshotIndex}</strong><span>Capturas</span></div>
      <div class="stat"><strong class="pass">${account ? 'OK' : '—'}</strong><span>Login + catálogo</span></div>
    </div>
    <section class="scope">
      <h3>Alcance</h3>
      <ul>
        <li>Empezar a practicar → registro → login → catálogo /cursos</li>
        <li>Inscripción en cursos disponibles y verificación de cursos bloqueados (REQ-C03)</li>
        <li>Valores límite: cupos (0 = Sin cupos, 1 = último cupo), prerequisitos pendientes vs completados</li>
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
  await screenshot(page, 'registro-empezar');

  // 2. Login con cuenta creada
  log('FASE A — Crear cuenta e iniciar sesión');
  await registerAndLogin(page);
  await screenshot(page, 'login-exitoso');

  // 3. Ver catálogo
  log('FASE B — Catálogo de cursos');
  await goToCatalog(page);
  await screenshot(page, 'catalogo-inicial');

  // REQ-C01: verificar campos del catálogo
  const fundamentosCard = await getCourseState(page, 'fundamentos');
  const requiredFields = ['Principiante', 'disponible'];
  const missingFields = requiredFields.filter((f) => !fundamentosCard.cardText.includes(f));
  if (missingFields.length) {
    await reportBug(page, {
      id: 'catalogo-campos-incompletos',
      severity: 'Media',
      req: 'REQ-C01',
      category: 'Catálogo',
      title: 'Tarjeta de curso no muestra todos los campos requeridos',
      steps: ['Abrir /cursos autenticado', 'Revisar tarjeta Fundamentos de Testing'],
      data: `Campos faltantes detectados: ${missingFields.join(', ')}`,
      expected: 'Título, descripción, nivel, duración, prerequisito y cupos.',
      actual: `Texto tarjeta (extracto): ${fundamentosCard.cardText.slice(0, 200)}...`,
    });
  }

  // Estado inicial: todos los bloqueados excepto fundamentos
  log('FASE B.2 — Verificar cursos bloqueados (estado inicial, valor límite: 0 prerequisitos completados)');
  const initialStates = {};
  for (const c of COURSES) {
    initialStates[c.id] = await getCourseState(page, c.id);
    log(`${c.id}: enroll="${initialStates[c.id].enrollText}" locked=${initialStates[c.id].lockedVisible} spots=${initialStates[c.id].spots}`);
  }

  for (const c of COURSES.filter((x) => x.prereq)) {
    const st = initialStates[c.id];
    if (!st.lockedVisible && !st.enrollDisabled) {
      await reportBug(page, {
        id: `desbloqueado-sin-prereq-${c.id}`,
        severity: 'Alta',
        req: 'REQ-C03',
        category: 'Prerequisitos',
        title: `"${c.name}" habilitado sin completar prerequisito`,
        steps: ['Entrar al catálogo sin cursos completados', `Revisar curso ${c.id}`],
        data: `Prerequisito requerido: ${c.prereq}\nCursos completados: 0`,
        expected: 'Curso bloqueado hasta completar prerequisito.',
        actual: `Botón: "${st.enrollText}", disabled=${st.enrollDisabled}, locked visible=${st.lockedVisible}`,
      });
    }
  }

  if (initialStates.fundamentos.enrollDisabled) {
    await reportBug(page, {
      id: 'fundamentos-bloqueado-inicial',
      severity: 'Alta',
      req: 'REQ-C03',
      category: 'Prerequisitos',
      title: 'Fundamentos de Testing bloqueado sin prerequisitos (debería estar disponible)',
      steps: ['Abrir catálogo como usuario nuevo'],
      data: 'Curso sin prerequisito',
      expected: 'Botón Inscribirse habilitado.',
      actual: `Estado: ${JSON.stringify(initialStates.fundamentos)}`,
    });
  }

  await screenshot(page, 'catalogo-estado-inicial');

  // 4. Inscribirse en cursos posibles
  log('FASE C — Inscripción en Fundamentos (único disponible inicialmente)');
  const spotsBeforeFund = parseSpots(initialStates.fundamentos.spots);
  await page.getByTestId('enroll-fundamentos').click();
  await pause(page, 1200);
  const afterFund = await getCourseState(page, 'fundamentos');
  log(`Fundamentos tras inscribir: ${afterFund.enrollText}, cupos: ${afterFund.spots}`);
  await screenshot(page, 'inscripcion-fundamentos');

  // REQ-C04: cupos deben bajar en 1
  const spotsAfterFund = parseSpots(afterFund.spots);
  if (spotsBeforeFund !== null && spotsAfterFund !== null && spotsAfterFund >= spotsBeforeFund) {
    await reportBug(page, {
      id: 'cupos-no-disminuyen',
      severity: 'Alta',
      req: 'REQ-C04',
      category: 'Cupos',
      title: 'Los cupos disponibles no disminuyen tras inscripción exitosa',
      steps: ['Anotar cupos de Fundamentos', 'Inscribirse', 'Comparar cupos'],
      data: `Valor límite: antes=${spotsBeforeFund}, después=${spotsAfterFund}`,
      expected: `Cupos después = ${spotsBeforeFund - 1}`,
      actual: `Cupos permanecen en ${spotsAfterFund} (${afterFund.spots})`,
    });
  }

  // REQ-C05 / badge Inscrito
  const hasInscritoBadge =
    afterFund.badge?.includes('Inscrito') ||
    afterFund.status?.includes('Inscrito') ||
    afterFund.enrollText?.includes('Ya inscrito') ||
    afterFund.enrollText?.includes('Inscrito');
  if (!hasInscritoBadge) {
    await reportBug(page, {
      id: 'sin-badge-inscrito',
      severity: 'Media',
      req: 'REQ-C02',
      category: 'Inscripción',
      title: 'Tras inscribirse no aparece badge/estado "Inscrito"',
      steps: ['Inscribirse en Fundamentos', 'Buscar badge o estado'],
      data: `badge="${afterFund.badge}" status="${afterFund.status}" btn="${afterFund.enrollText}"`,
      expected: 'Indicador visible de estado Inscrito.',
      actual: 'No se encontró badge Inscrito.',
    });
  }

  // REQ-C03: valor límite — solo inscrito, NO completado
  log('FASE C.2 — Valor límite REQ-C03: inscrito ≠ completado');
  const afterEnrollStates = {};
  for (const c of COURSES.filter((x) => x.prereq === 'fundamentos')) {
    afterEnrollStates[c.id] = await getCourseState(page, c.id);
    log(`Tras inscribir fundamentos → ${c.id}: locked=${afterEnrollStates[c.id].lockedVisible} btn="${afterEnrollStates[c.id].enrollText}"`);
  }

  const pwCero = afterEnrollStates['playwright-cero'];
  const diseno = afterEnrollStates['diseno-casos'];

  if (diseno && !diseno.lockedVisible && !diseno.enrollDisabled) {
    await reportBug(page, {
      id: 'diseno-desbloqueado-solo-inscrito',
      severity: 'Alta',
      req: 'REQ-C03',
      category: 'Prerequisitos',
      title: 'Diseño de casos se desbloquea al estar inscrito (no completado) en Fundamentos',
      steps: [
        'Inscribirse en Fundamentos (sin completarlo)',
        'Revisar curso Diseño de casos de prueba',
        'Comparar con Playwright desde cero (mismo prerequisito)',
      ],
      data: 'Valor límite: prerequisito INSCRITO pero no COMPLETADO\nplaywright-cero locked=' + pwCero?.lockedVisible + '\ndiseno-casos locked=' + diseno.lockedVisible,
      expected: 'Ambos cursos siguen bloqueados hasta COMPLETAR Fundamentos.',
      actual: `Diseño: botón "${diseno.enrollText}" habilitado. Playwright-cero: locked=${pwCero?.lockedVisible}.`,
    });

    // Intentar inscribirse (confirma bug)
    if (timeLeft() > 10000) {
      await page.getByTestId('enroll-diseno-casos').click();
      await pause(page, 1000);
      const disenoAfter = await getCourseState(page, 'diseno-casos');
      if (disenoAfter.enrollText?.includes('Ya inscrito')) {
        await reportBug(page, {
          id: 'inscripcion-sin-prereq-completado',
          severity: 'Alta',
          req: 'REQ-C02',
          category: 'Tabla de decisión',
          title: 'Permite inscribirse en curso con prerequisito no completado',
          steps: ['Inscribir Fundamentos sin completar', 'Inscribir Diseño de casos'],
          data: 'Prerequisito completado: No\nCupo disponible: Sí',
          expected: 'Rechazado (prerequisito pendiente).',
          actual: `Inscripción exitosa: "${disenoAfter.enrollText}"`,
        });
      }
      await screenshot(page, 'inscripcion-diseno-sin-prereq');
    }
  }

  if (pwCero?.lockedVisible && !diseno?.lockedVisible) {
    await screenshot(page, 'inconsistencia-prerequisitos');
  }

  // Valor límite: curso con 0 cupos (api-testing)
  log('FASE D — Valores límite de cupos (0 y 1)');
  const apiTesting = await getCourseState(page, 'api-testing');
  const liderazgo = await getCourseState(page, 'liderazgo-qa');
  log(`api-testing (0 cupos): ${apiTesting.spots}`);
  log(`liderazgo-qa (1 cupo): ${liderazgo.spots}`);

  if (!apiTesting.spots?.includes('Sin cupos')) {
    await reportBug(page, {
      id: 'api-testing-cupos-incorrectos',
      severity: 'Media',
      req: 'REQ-C01',
      category: 'Cupos límite',
      title: 'API Testing no muestra "Sin cupos" como valor límite 0',
      steps: ['Revisar cupos de api-testing en catálogo'],
      data: 'Valor límite esperado: 0 cupos',
      expected: 'Texto "Sin cupos".',
      actual: apiTesting.spots,
    });
  }

  // REQ-C06: API rechaza curso con prerequisito pendiente
  if (timeLeft() > 8000) {
    log('FASE E — API enroll (REQ-C06, valor límite: prerequisito pendiente)');
    const apiResp = await page.evaluate(async () => {
      const r = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'playwright-cero' }),
      });
      return { status: r.status, body: await r.text() };
    });
    log(`API enroll playwright-cero: ${apiResp.status} ${apiResp.body.slice(0, 80)}`);
    if (apiResp.status === 200 && apiResp.body.includes('inscrito')) {
      await reportBug(page, {
        id: 'api-enroll-sin-prereq',
        severity: 'Alta',
        req: 'REQ-C06',
        category: 'API',
        title: 'API permite inscribir curso con prerequisito no completado',
        steps: ['POST /api/enroll con courseId=playwright-cero', 'Sin haber completado Fundamentos'],
        data: 'Body: { "courseId": "playwright-cero" }',
        expected: '403 prerequisito no completado.',
        actual: `HTTP ${apiResp.status}: ${apiResp.body}`,
      });
    }
    await screenshot(page, 'catalogo-final');
  }

  // Verificación final bloqueados
  log('FASE F — Verificación final de cursos bloqueados');
  await goToCatalog(page);
  const finalCheck = {};
  for (const c of COURSES) {
    finalCheck[c.id] = await getCourseState(page, c.id);
  }
  const shouldBeLocked = COURSES.filter((c) => c.prereq && !['diseno-casos'].includes(c.id));
  for (const c of shouldBeLocked) {
    const st = finalCheck[c.id];
    if (!st.lockedVisible && st.enrollText === 'Inscribirse' && !st.enrollDisabled) {
      await reportBug(page, {
        id: `final-desbloqueado-${c.id}`,
        severity: 'Alta',
        req: 'REQ-C03',
        category: 'Prerequisitos',
        title: `"${c.name}" incorrectamente habilitado al final de la sesión`,
        steps: ['Revisar catálogo tras inscripciones parciales'],
        data: `Prerequisito: ${c.prereq}`,
        expected: 'Bloqueado.',
        actual: JSON.stringify(st),
      });
    }
  }
  await screenshot(page, 'catalogo-verificacion-final');

  const remaining = timeLeft();
  if (remaining > 0) {
    log(`Completando ventana de 2 min (${(remaining / 1000).toFixed(0)}s restantes)...`);
    await page.waitForTimeout(remaining);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'Exploratorio-VerCursosReporte.html'), buildHtmlReport(), 'utf8');
  fs.writeFileSync(
    path.join(OUT_DIR, 'Exploratorio-VerCursosReporte.json'),
    JSON.stringify({ findings, account, sessionLog, durationSeconds: elapsed() }, null, 2),
    'utf8'
  );

  log('Cerrando navegador en 3s...');
  await page.waitForTimeout(3000);
  await browser.close();

  console.log(`\nReporte: ${path.join(OUT_DIR, 'Exploratorio-VerCursosReporte.html')}`);
  console.log(`Bugs: ${findings.length}`);
  findings.forEach((f, i) => console.log(`  ${i + 1}. [${f.severity}] ${f.title}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
