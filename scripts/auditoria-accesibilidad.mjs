import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://academia-sin-humo.vercel.app';
const OUT_DIR = path.resolve('Accesibilidad');
const EVID_DIR = path.join(OUT_DIR, 'evidencia');

const PAGES = [
  { name: 'Inicio', path: '/' },
  { name: 'Registro', path: '/registro' },
  { name: 'Login', path: '/login' },
  { name: 'Documentación', path: '/documentacion' },
];

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const IMPACT_ES = {
  critical: 'crítico',
  serious: 'serio',
  moderate: 'moderado',
  minor: 'menor',
};

const allIssues = [];
const manualChecks = [];
let screenshotIndex = 0;

function impactLabel(impact) {
  return IMPACT_ES[impact] ?? impact ?? 'desconocido';
}

async function screenshot(page, label) {
  screenshotIndex += 1;
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
  const filename = `${String(screenshotIndex).padStart(3, '0')}-${safe}.png`;
  await page.screenshot({ path: path.join(EVID_DIR, filename), fullPage: false, timeout: 15000 });
  return `evidencia/${filename}`;
}

function addIssue(issue) {
  allIssues.push(issue);
}

function addManual(check) {
  manualChecks.push(check);
}

async function runAxeScan(page, pageInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();

  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const selector = node.target?.join(' ') ?? 'N/A';
      let evidence = '';
      try {
        await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 3000 });
        evidence = await screenshot(page, `${pageInfo.name}-${violation.id}`);
      } catch {
        evidence = await screenshot(page, `${pageInfo.name}-${violation.id}-pagina`);
      }

      addIssue({
        source: 'axe-core',
        page: pageInfo.name,
        url: pageInfo.url,
        ruleId: violation.id,
        impact: violation.impact,
        impactEs: impactLabel(violation.impact),
        selector,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        html: node.html?.slice(0, 300) ?? '',
        failureSummary: node.failureSummary ?? '',
        evidence,
        solution: violation.help,
        status: 'Fallido',
        wcag: (violation.tags ?? []).filter((t) => t.startsWith('wcag')).join(', '),
      });
    }
  }

  for (const incomplete of results.incomplete) {
    addIssue({
      source: 'axe-core (incompleto)',
      page: pageInfo.name,
      url: pageInfo.url,
      ruleId: incomplete.id,
      impact: incomplete.impact ?? 'moderate',
      impactEs: impactLabel(incomplete.impact ?? 'moderate'),
      selector: incomplete.nodes?.[0]?.target?.join(' ') ?? 'N/A',
      description: incomplete.description,
      help: incomplete.help,
      helpUrl: incomplete.helpUrl,
      html: incomplete.nodes?.[0]?.html?.slice(0, 300) ?? '',
      failureSummary: 'Verificación incompleta — requiere revisión manual.',
      evidence: '',
      solution: incomplete.help,
      status: 'Incompleto',
      wcag: (incomplete.tags ?? []).filter((t) => t.startsWith('wcag')).join(', '),
    });
  }

  return results;
}

async function checkHeadingHierarchy(page, pageInfo) {
  const headings = await page.evaluate(() => {
    return [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el, i) => ({
      tag: el.tagName.toLowerCase(),
      level: parseInt(el.tagName[1], 10),
      text: el.textContent?.trim().slice(0, 80) ?? '',
      index: i,
    }));
  });

  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count === 0) {
    addManual({
      page: pageInfo.name,
      url: pageInfo.url,
      ruleId: 'heading-h1-missing',
      impactEs: 'serio',
      selector: 'h1',
      description: 'La página no tiene un encabezado h1.',
      solution: 'Añadir un único h1 que describa el propósito principal de la página.',
      status: 'Fallido',
      evidence: await screenshot(page, `${pageInfo.name}-sin-h1`),
    });
  } else if (h1Count > 1) {
    addManual({
      page: pageInfo.name,
      url: pageInfo.url,
      ruleId: 'heading-multiple-h1',
      impactEs: 'moderado',
      selector: 'h1',
      description: `Se encontraron ${h1Count} elementos h1 (se recomienda uno por página).`,
      solution: 'Conservar un solo h1 y degradar los demás a h2 según jerarquía.',
      status: 'Fallido',
      evidence: await screenshot(page, `${pageInfo.name}-multi-h1`),
    });
  }

  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1].level;
    const curr = headings[i].level;
    if (curr - prev > 1) {
      addManual({
        page: pageInfo.name,
        url: pageInfo.url,
        ruleId: 'heading-skip-level',
        impactEs: 'moderado',
        selector: headings[i].tag,
        description: `Salto de nivel: ${headings[i - 1].tag} → ${headings[i].tag} ("${headings[i].text}").`,
        solution: 'No saltar niveles de encabezado (p. ej. h2 → h4). Insertar el nivel intermedio.',
        status: 'Fallido',
        evidence: await screenshot(page, `${pageInfo.name}-heading-skip`),
      });
    }
  }

  return headings;
}

async function checkFormLabels(page, pageInfo) {
  const unlabeled = await page.evaluate(() => {
    const fields = [...document.querySelectorAll('input, select, textarea')].filter(
      (el) => !['hidden', 'submit', 'button', 'reset'].includes(el.type)
    );
    return fields
      .map((el) => {
        const id = el.id;
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledby = el.getAttribute('aria-labelledby');
        const hasLabel = id && document.querySelector(`label[for="${id}"]`);
        const wrapped = el.closest('label');
        const ok = !!(hasLabel || ariaLabel || ariaLabelledby || wrapped);
        if (ok) return null;
        const selector =
          el.getAttribute('data-testid') ||
          el.name ||
          el.id ||
          `${el.tagName.toLowerCase()}[type="${el.type}"]`;
        return {
          selector: `[data-testid="${el.getAttribute('data-testid')}"]` || selector,
          html: el.outerHTML.slice(0, 200),
          name: el.getAttribute('name') ?? '',
        };
      })
      .filter(Boolean);
  });

  for (const field of unlabeled) {
    addManual({
      page: pageInfo.name,
      url: pageInfo.url,
      ruleId: 'form-label-missing',
      impactEs: 'crítico',
      selector: field.selector,
      description: 'Campo de formulario sin etiqueta accesible (label, aria-label o aria-labelledby).',
      solution: 'Asociar un <label for="id"> visible o usar aria-label / aria-labelledby.',
      status: 'Fallido',
      evidence: await screenshot(page, `${pageInfo.name}-sin-label`),
      html: field.html,
    });
  }
}

async function checkKeyboardNavigation(page, pageInfo) {
  await page.keyboard.press('Tab');
  const focusTrail = [];
  let previousActive = null;
  let stuckCount = 0;

  for (let i = 0; i < 25; i++) {
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { selector: 'body', text: '', tag: 'body' };
      const testId = el.getAttribute('data-testid');
      const id = el.id ? `#${el.id}` : '';
      const tag = el.tagName.toLowerCase();
      return {
        selector: testId ? `[data-testid="${testId}"]` : `${tag}${id}`,
        text: el.textContent?.trim().slice(0, 40) ?? el.getAttribute('aria-label') ?? '',
        tag,
      };
    });

    focusTrail.push(active);

    if (JSON.stringify(active) === JSON.stringify(previousActive)) {
      stuckCount += 1;
      if (stuckCount >= 3) {
        addManual({
          page: pageInfo.name,
          url: pageInfo.url,
          ruleId: 'keyboard-focus-trap',
          impactEs: 'crítico',
          selector: active.selector,
          description: `Posible trampa de foco: el foco permanece en ${active.selector} tras múltiples Tab.`,
          solution: 'Permitir que Tab avance al siguiente elemento. Revisar tabindex y modales.',
          status: 'Fallido',
          evidence: await screenshot(page, `${pageInfo.name}-focus-trap`),
        });
        break;
      }
    } else {
      stuckCount = 0;
    }

    previousActive = active;
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
  }

  // Shift+Tab: comprobar que se puede retroceder
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(120);
  }
  const afterShift = await page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute('data-testid') ?? el?.tagName ?? 'unknown';
  });

  addManual({
    page: pageInfo.name,
    url: pageInfo.url,
    ruleId: 'keyboard-navigation-audit',
    impactEs: 'menor',
    selector: 'document',
    description: `Recorrido Tab registrado (${focusTrail.length} pasos). Shift+Tab activo en: ${afterShift}.`,
    solution: 'Verificar orden lógico de foco y visibilidad del indicador de foco.',
    status: focusTrail.some((f) => f.tag === 'body') ? 'Fallido' : 'Aprobado',
    evidence: '',
    focusTrail: focusTrail.map((f) => f.selector).join(' → '),
  });

  return focusTrail;
}

function extractContrastFingerprint(failureSummary = '') {
  const fg = failureSummary.match(/foreground color:\s*(#[0-9a-fA-F]{3,8})/i)?.[1]?.toLowerCase() ?? '';
  const bg = failureSummary.match(/background color:\s*(#[0-9a-fA-F]{3,8})/i)?.[1]?.toLowerCase() ?? '';
  const ratio = failureSummary.match(/contrast of\s*([\d.]+)/i)?.[1] ?? '';
  return { fg, bg, ratio, key: `${fg}|${bg}` };
}

function groupKey(issue) {
  if (issue.ruleId === 'color-contrast') {
    const { key } = extractContrastFingerprint(issue.failureSummary);
    return `color-contrast|${issue.status}|${key}`;
  }
  if (issue.ruleId === 'keyboard-navigation-audit') {
    return `keyboard-navigation-audit|${issue.status}`;
  }
  return `${issue.ruleId}|${issue.status}|${(issue.failureSummary || issue.description || '').slice(0, 120)}`;
}

function groupIssues(issues) {
  const map = new Map();

  for (const issue of issues) {
    const key = groupKey(issue);
    if (!map.has(key)) {
      const contrast =
        issue.ruleId === 'color-contrast' ? extractContrastFingerprint(issue.failureSummary) : null;

      map.set(key, {
        ruleId: issue.ruleId,
        impact: issue.impact,
        impactEs: issue.impactEs,
        status: issue.status,
        description: issue.description ?? issue.help,
        help: issue.help,
        helpUrl: issue.helpUrl,
        failureSummary: issue.failureSummary,
        solution: issue.solution,
        wcag: issue.wcag,
        source: issue.source,
        contrast,
        locations: [],
      });
    }

    const group = map.get(key);
    group.locations.push({
      page: issue.page,
      url: issue.url,
      selector: issue.selector,
      html: issue.html ?? '',
      evidence: issue.evidence ?? '',
      failureSummary: issue.failureSummary ?? '',
      focusTrail: issue.focusTrail ?? '',
    });
  }

  const grouped = [...map.values()].map((g) => ({
    ...g,
    count: g.locations.length,
    pages: [...new Set(g.locations.map((l) => l.page))],
    evidence: g.locations.find((l) => l.evidence)?.evidence ?? '',
  }));

  grouped.sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9));
  return grouped;
}

function buildCsvGrouped(groups) {
  const header =
    'Estado,Severidad,ID Regla,Ocurrencias,Páginas,Selectores,Descripción,Solución,Evidencia,WCAG';
  const rows = groups.map((g) => {
    const selectors = g.locations.map((l) => `${l.page}: ${l.selector}`).join(' | ');
    const pages = g.pages.join(', ');
    const desc =
      g.contrast?.fg
        ? `Contraste insuficiente: ${g.contrast.fg} sobre ${g.contrast.bg} (ratio ~${g.contrast.ratio}:1, requiere 4.5:1). ${g.count} elemento(s).`
        : (g.description ?? '').replace(/"/g, '""');
    const cols = [
      g.status,
      g.impactEs,
      g.ruleId,
      String(g.count),
      pages,
      selectors.replace(/"/g, '""'),
      desc,
      (g.solution ?? '').replace(/"/g, '""'),
      g.evidence ?? '',
      g.wcag ?? '',
    ];
    return cols.map((c) => `"${c}"`).join(',');
  });
  return [header, ...rows].join('\n');
}

function buildCsv(issues) {
  return buildCsvGrouped(groupIssues(issues));
}

function escapeHtml(text = '') {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildLocationsHtml(locations) {
  return `<ul class="locations">
    ${locations
      .map(
        (loc) => `
      <li>
        <strong>${escapeHtml(loc.page)}</strong>
        <code>${escapeHtml(loc.selector)}</code>
        ${loc.html ? `<pre class="snippet">${escapeHtml(loc.html)}</pre>` : ''}
        ${loc.evidence ? `<a href="${loc.evidence}" target="_blank">Ver captura</a>` : ''}
      </li>`
      )
      .join('')}
  </ul>`;
}

function buildHtml(groups, summary) {
  const bySeverity = ['crítico', 'serio', 'moderado', 'menor'].map((sev) => ({
    sev,
    items: groups.filter((i) => i.impactEs === sev),
  }));

  const sections = bySeverity
    .filter((g) => g.items.length)
    .map(
      (g) => `
    <section class="severity-block">
      <h2>Severidad: ${g.sev} (${g.items.length} bug${g.items.length === 1 ? '' : 's'} agrupados · ${g.items.reduce((n, i) => n + i.count, 0)} ocurrencias)</h2>
      ${g.items
        .map(
          (i) => `
        <article class="issue">
          <header>
            <span class="badge ${i.status === 'Fallido' ? 'fail' : i.status === 'Incompleto' ? 'incomplete' : 'pass'}">${i.status}</span>
            <span class="badge impact">${i.impactEs}</span>
            <span class="badge count">${i.count} ocurrencia${i.count === 1 ? '' : 's'}</span>
            <strong>${i.ruleId}</strong>
          </header>
          <p>${escapeHtml(i.description)}</p>
          ${
            i.contrast?.fg
              ? `<p class="detail"><strong>Colores:</strong> texto <code>${i.contrast.fg}</code> sobre fondo <code>${i.contrast.bg}</code> · ratio detectado ~<strong>${i.contrast.ratio}:1</strong> (requerido 4.5:1)</p>`
              : ''
          }
          ${i.failureSummary && !i.contrast?.fg ? `<p class="detail">${escapeHtml(i.failureSummary.split('\n')[1]?.trim() || i.failureSummary)}</p>` : ''}
          <p><strong>Páginas afectadas:</strong> ${i.pages.map((p) => escapeHtml(p)).join(', ')}</p>
          <h3>Dónde se encuentra (${i.count})</h3>
          ${buildLocationsHtml(i.locations)}
          <p><strong>Solución:</strong> ${escapeHtml(i.solution)}</p>
          ${i.wcag ? `<p><strong>WCAG:</strong> ${escapeHtml(i.wcag)}</p>` : ''}
          ${
            i.evidence
              ? `<figure><img src="${i.evidence}" alt="Evidencia ${i.ruleId}" /><figcaption>Evidencia principal: ${i.evidence}</figcaption></figure>`
              : ''
          }
          ${
            i.locations[0]?.focusTrail
              ? `<p><strong>Orden Tab (${i.locations[0].page}):</strong> ${escapeHtml(i.locations[0].focusTrail)}</p>`
              : ''
          }
        </article>`
        )
        .join('')}
    </section>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Accesibilidad — Auditoría WCAG 2.2</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0f1419;color:#e7ecf3;margin:0;padding:2rem;line-height:1.5}
    .container{max-width:1100px;margin:0 auto}
    header{background:#1a2332;border:1px solid #2a3548;border-radius:16px;padding:2rem;margin-bottom:2rem}
    .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin:1.5rem 0}
    .stat{background:#1a2332;border:1px solid #2a3548;border-radius:12px;padding:1rem}
    .stat strong{display:block;font-size:1.8rem;color:#5b9cff}
    .stat span{color:#9aa8bc;font-size:.85rem}
    .severity-block{margin-bottom:2rem}
    .issue{background:#1a2332;border:1px solid #2a3548;border-radius:12px;padding:1.25rem;margin:1rem 0}
    .badge{display:inline-block;padding:.2rem .5rem;border-radius:999px;font-size:.75rem;font-weight:700;margin-right:.35rem}
    .badge.fail{background:rgba(255,107,107,.2);color:#ff6b6b}
    .badge.incomplete{background:rgba(255,179,71,.2);color:#ffb347}
    .badge.pass{background:rgba(107,203,119,.2);color:#6bcb77}
    .badge.impact{background:rgba(91,156,255,.15);color:#5b9cff}
    .badge.count{background:rgba(155,89,182,.15);color:#c792ea}
    code,pre{background:#101826;padding:.2rem .4rem;border-radius:4px;font-size:.85rem}
    pre.snippet{padding:.5rem;overflow-x:auto;margin:.35rem 0;font-size:.8rem;max-height:80px}
    .locations{list-style:none;padding:0;margin:.5rem 0}
    .locations li{border-left:3px solid #2a3548;padding:.5rem .75rem;margin:.5rem 0;background:#101826;border-radius:0 8px 8px 0}
    .locations code{display:block;margin-top:.25rem;word-break:break-all}
    .locations a{color:#5b9cff;font-size:.85rem}
    img{max-width:100%;border-radius:8px;border:1px solid #2a3548;margin-top:.5rem}
    .final{font-size:1.25rem;font-weight:700;margin-top:1rem}
    .final.fail{color:#ff6b6b}
    .final.pass{color:#6bcb77}
    .detail{color:#9aa8bc;font-size:.9rem}
    h3{font-size:1rem;margin:1rem 0 .5rem;color:#5b9cff}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Auditoría de Accesibilidad — Accesibilidad</h1>
      <p>URL base: ${BASE_URL} · WCAG 2.2 nivel A y AA · axe-core + comprobaciones manuales automatizadas</p>
      <p>Fecha: ${new Date().toLocaleString('es-ES')}</p>
      <p class="detail">Bugs agrupados por regla y causa raíz (p. ej. mismo par de colores en contraste).</p>
    </header>
    <div class="summary">
      <div class="stat"><strong>${summary.groupedTotal}</strong><span>Bugs agrupados</span></div>
      <div class="stat"><strong>${summary.totalOccurrences}</strong><span>Ocurrencias totales</span></div>
      <div class="stat"><strong>${summary.failed}</strong><span>Fallidos</span></div>
      <div class="stat"><strong>${summary.incomplete}</strong><span>Incompletos</span></div>
    </div>
    <p class="final ${summary.overallStatus === 'Fallido' ? 'fail' : 'pass'}">
      Estado final: ${summary.overallStatus}
    </p>
    <p>Páginas auditadas: ${PAGES.map((p) => p.name).join(', ')}</p>
    ${sections || '<p>Sin violaciones axe-core detectadas.</p>'}
  </div>
</body>
</html>`;
}

function buildSummary(rawIssues, grouped) {
  const failed = grouped.filter((g) => g.status === 'Fallido').length;
  const incomplete = grouped.filter((g) => g.status === 'Incompleto').length;
  const critical = grouped.filter((g) => g.impactEs === 'crítico').length;
  const serious = grouped.filter((g) => g.impactEs === 'serio').length;

  return {
    totalOccurrences: rawIssues.length,
    groupedTotal: grouped.length,
    failed,
    incomplete,
    critical,
    serious,
    overallStatus:
      rawIssues.some((i) => i.status === 'Fallido' || i.status === 'Incompleto') ? 'Fallido' : 'Aprobado',
  };
}

function writeReports(rawIssues) {
  const grouped = groupIssues(rawIssues);
  const summary = buildSummary(rawIssues, grouped);

  fs.writeFileSync(path.join(OUT_DIR, 'Accesibilidad.csv'), buildCsvGrouped(grouped), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'Accesibilidad.html'), buildHtml(grouped, summary), 'utf8');
  fs.writeFileSync(
    path.join(OUT_DIR, 'Accesibilidad.json'),
    JSON.stringify({ summary, groupedIssues: grouped, rawIssues, pages: PAGES.map((p) => `${BASE_URL}${p.path}`) }, null, 2),
    'utf8'
  );

  return { summary, grouped };
}

async function main() {
  fs.mkdirSync(EVID_DIR, { recursive: true });

  console.log('Iniciando auditoría WCAG 2.2 con Chromium + axe-core...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  for (const pageInfo of PAGES) {
    const url = `${BASE_URL}${pageInfo.path}`;
    pageInfo.url = url;
    console.log(`\nAuditando: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);

    await runAxeScan(page, pageInfo);
    await checkHeadingHierarchy(page, pageInfo);
    await checkFormLabels(page, pageInfo);
    await checkKeyboardNavigation(page, pageInfo);
  }

  await browser.close();

  const combined = [...allIssues, ...manualChecks];
  const { summary, grouped } = writeReports(combined);

  console.log('\n=== RESUMEN ===');
  console.log(`Estado final: ${summary.overallStatus}`);
  console.log(`Ocurrencias: ${summary.totalOccurrences} | Bugs agrupados: ${summary.groupedTotal}`);
  console.log(`Fallidos: ${summary.failed} | Incompletos: ${summary.incomplete}`);
  console.log(`Reportes: ${OUT_DIR}/Accesibilidad.html`);
  console.log(`CSV: ${OUT_DIR}/Accesibilidad.csv`);
}

if (process.argv.includes('--regroup')) {
  const jsonPath = path.join(OUT_DIR, 'Accesibilidad.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const raw = data.rawIssues ?? data.issues ?? [];
  const { summary, grouped } = writeReports(raw);
  console.log(`Regrouped: ${summary.totalOccurrences} ocurrencias → ${summary.groupedTotal} bugs`);
  grouped.forEach((g) => console.log(`  - ${g.ruleId} (${g.contrast?.fg ?? 'n/a'}): ${g.count} en [${g.pages.join(', ')}]`));
  console.log(`HTML: ${path.join(OUT_DIR, 'Accesibilidad.html')}`);
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
