# mi-suite-automation

Suite de automatización QA con **Playwright** y **TypeScript** sobre [Academia sin Humo](https://academia-sin-humo.vercel.app/): plataforma de práctica con bugs intencionales para aprender testing basado en especificación.

Proyecto de portafolio que combina **pruebas automatizadas E2E/API**, **pruebas exploratorias guiadas por requisitos**, **auditorías de accesibilidad WCAG 2.2** y **reportes HTML con evidencia visual**.

---

## Objetivo

Diseñar, ejecutar y documentar pruebas comparando el comportamiento real de la app contra la [documentación oficial](https://academia-sin-humo.vercel.app/documentacion). Cada diferencia detectada queda registrada como bug, con capturas y trazabilidad al requisito (REQ-*).

---

## Stack

| Herramienta | Uso |
|-------------|-----|
| [Playwright](https://playwright.dev/) | E2E, API, capturas, modo visible |
| [axe-core](https://github.com/dequelabs/axe-core) | Auditoría de accesibilidad WCAG 2.2 |
| TypeScript | Specs tipados en `tests/` |
| Node.js | Scripts exploratorios en `scripts/` |
| Cursor | IDE de desarrollo |

**Entorno bajo prueba:** `https://academia-sin-humo.vercel.app` (configurado como `baseURL` en `playwright.config.ts`).

---

## Estructura del repositorio

```
mi-suite-automation/
├── tests/                          # Pruebas automatizadas (Playwright Test)
│   ├── registro.spec.ts            # Registro de estudiante (REQ-R01–R07)
│   ├── api.spec.ts                 # API cursos, progreso e inscripción
│   ├── upload.spec.ts              # Subida de CV (REQ-U01–U03)
│   └── estudiantes.spec.ts         # Paginación (REQ-N01–N03)
├── scripts/                        # Sesiones exploratorias y auditorías
│   ├── exploratorio-registroEstudiante.mjs
│   ├── exploratorio-IniciarSesionReporte.mjs
│   ├── exploratorio-VerCursosReporte.mjs
│   ├── exploratorio-MiProgresoReporte.mjs
│   └── auditoria-accesibilidad.mjs
├── Exploratorio-*/                 # Reportes exploratorios HTML + evidencia
├── Accesibilidad/                  # Reporte WCAG 2.2 (HTML, CSV, JSON, screenshots)
└── playwright.config.ts
```

---

## Cobertura por módulo

### Pruebas automatizadas (`tests/`)

| Archivo                | Módulo     | Técnica ISTQB               | Qué valida                                                                |
|------------------------|-----------------------------------       |---------------------------------------------------------------------------|  
| `registro.spec.ts`     | Registro   | Partición de equivalencia   | Flujo feliz, email inválido, bugs de password y dominio                   |
| `api.spec.ts`          | API        | Tabla de decisión / estados | `GET /api/courses`,retomar desde Abandonado, inscripción sin prerequisito |
| `upload.spec.ts`       | Subida CV  | Valores límite              | Tipo de archivo (PNG vs PDF) y tamaño (2.5 MB vs máx. 2 MB)               |
| `estudiantes.spec.ts`  | Paginación | Valores límite              | `totalPages` con 25 registros y `pageSize=10`                             |

### Sesiones exploratorias (`scripts/` + reportes HTML)

> Abre los `.html` en el navegador para ver hallazgos, pasos de reproducción y screenshots.

---

## Bugs detectados 

## Requisitos previos

- Node.js 18+
- npm

```bash
npm install
npx playwright install
```

---

## Ejecutar pruebas automatizadas

```bash
npm test                    # Todas las pruebas (Chromium, Firefox, WebKit)
npm run test:chromium       # Solo Chromium (más rápido en local)
npm run test:ui             # Modo UI interactivo
npm run report              # Ver reporte HTML de Playwright
```

También puedes usar directamente:

```bash
npx playwright test
npx playwright test tests/registro.spec.ts
npx playwright show-report
```

---

## Ejecutar sesiones exploratorias (modo visible)

Los scripts abren Chromium en pantalla (`headless: false`) durante ~2 minutos, capturan evidencia y generan reporte HTML.

```bash
npm run exploratorio:registro
npm run exploratorio:login
npm run exploratorio:cursos
npm run exploratorio:progreso
```

```bash
node scripts/exploratorio-registroEstudiante.mjs
node scripts/exploratorio-IniciarSesionReporte.mjs
node scripts/exploratorio-VerCursosReporte.mjs
node scripts/exploratorio-MiProgresoReporte.mjs
```

Cada ejecución crea/actualiza su carpeta `Exploratorio-*/` con:

- `Exploratorio-*.html` — reporte visual para el portafolio
- `Exploratorio-*.json` — hallazgos estructurados
- `evidencia/*.png` — capturas de pantalla

---

## Auditoría de accesibilidad (WCAG 2.2)

Auditoría automatizada con **Chromium + axe-core** sobre la `baseURL` configurada en `playwright.config.ts`, siguiendo reglas **WCAG 2.2 nivel A y AA**.

### Ejecutar

```bash
npm run accesibilidad
```

O directamente:

```bash
node scripts/auditoria-accesibilidad.mjs
```

### Páginas auditadas

- `/` (Inicio)
- `/registro`
- `/login`
- `/documentacion`

### Qué evalúa

| Comprobación | Herramienta |
|--------------|-------------|
| Violaciones WCAG 2.2 A / AA | axe-core (`wcag2a`, `wcag2aa`, `wcag22aa`) |
| Contraste de color | Regla `color-contrast` |
| Jerarquía de encabezados (h1–h6) | Análisis manual automatizado |
| Etiquetas accesibles en formularios | Análisis manual automatizado |
| Navegación por teclado (Tab / Shift+Tab) | Recorrido de foco y detección de trampas |

### Archivos de salida (`Accesibilidad/`)

| Archivo | Descripción |
|---------|-------------|
| `Accesibilidad.html` | Reporte visual agrupado por severidad |
| `Accesibilidad.csv` | Exportación separada por comas |
| `Accesibilidad.json` | Hallazgos estructurados |
| `evidencia/*.png` | Capturas por violación |

Cada hallazgo incluye: **ID de regla**, **impacto**, **selector**, **descripción**, **evidencia**, **sugerencia de solución** y **estado** (Aprobado / Fallido / Incompleto).

### Resultado de la última auditoría

| Métrica | Valor |
|---------|-------|
| **Estado final** | **Fallido** |
| Total hallazgos | 89 |
| Fallidos | 84 |
| Incompletos | 4 |
| Críticos | 0 |
| Serios | 85 |

#### Hallazgo principal: contraste de color (`color-contrast`)

| Campo | Detalle |
|-------|---------|
| **ID regla** | `color-contrast` |
| **WCAG** | 1.4.3 Contraste (mínimo) — nivel AA |
| **Impacto** | Serio |
| **Problema** | Color primario `#008ecc` sobre fondo claro con ratio ~**3.5:1** (requiere **4.5:1** en texto normal) |
| **Elementos afectados** | Logo “sin Humo”, enlaces `text-primary`, badges, cards del catálogo, botones, etc. |
| **Solución sugerida** | Oscurecer `--primary` (p. ej. `#006699` o superior) o usar variantes con contraste ≥ 4.5:1 |

#### Otras comprobaciones

| Verificación | Estado |
|--------------|--------|
| Jerarquía de encabezados (h1–h6) | Aprobado |
| Etiquetas en formularios (registro / login) | Aprobado |
| Trampas de foco | No detectadas |
| Navegación Tab (Inicio) | Aprobado |
| Navegación Tab (registro, login, docs) | Fallido (menor) — foco llega a `body` en el ciclo |

> Abre [`Accesibilidad/Accesibilidad.html`](Accesibilidad/Accesibilidad.html) para ver el detalle completo con capturas.

---

## Configuración

`playwright.config.ts` define:

- `baseURL`: Academia sin Humo
- Proyectos: Desktop Chrome, Firefox y Safari
- Reporter HTML y trace en primer reintento
- Retries y workers ajustados para CI

---

## Cuenta de prueba (sandbox)

La app incluye credenciales demo para el laboratorio:

- **Email:** `ana.garcia@ejemplo.com`
- **Password:** `Segura2026!`

Las cuentas creadas en `/registro` son del playground y no son cuentas reales.

---

## Autora

**Mayra Manzi** — QA | Automatización con Playwright

Proyecto desarrollado como parte del aprendizaje en [Academia sin Humo](https://academia-sin-humo.vercel.app/) y [Calidad sin Humo](https://calidadsinhumo.com).

---
