---
description: "Advanced software-engineer level web automation patterns for CARGA360GO: Playwright best practices, reliable locators, session/storage state, hybrid API+UI, structured extraction, error handling, retries, observability and bot integration."
connections: [browser-automation, integrations-and-automation, components-and-apis, agent-workflows]
---

# Advanced Web Automation — Nivel Ingeniero de Software

Guía de automatización web robusta, mantenible y observable para CARGA360GO. Preferir siempre APIs autorizadas; usar navegador solo cuando no exista endpoint o para validación visual/end-to-end.

## Principios de ingeniería

1. **API-first**: inspeccionar Network tab / docs. Si existe endpoint estable → usarlo (más rápido, fiable, auditable).
2. **UI como fallback**: solo para flujos sin API o verificación de UI real.
3. **Determinismo**: mismos inputs → mismos resultados. Evitar flakiness.
4. **Observabilidad**: traces, screenshots, logs estructurados, métricas de éxito/fallo.
5. **Seguridad**: nunca hardcodear credenciales. Usar env vars / secretos del bot. Respetar rate limits y ToS.
6. **Mantenibilidad**: Page Object Model (POM), locators estables, tests de los propios automatismos.

## Playwright — Patrones de producción

### Configuración base recomendada
```typescript
// playwright.config.ts (ejemplo)
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: {
    baseURL: 'https://www.carga360go.cl',
    storageState: process.env.STORAGE_STATE || undefined,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  retries: 2,
  workers: process.env.CI ? 2 : 4,
});
```

En este repositorio la config real está en `playwright.config.ts`: `storageState` sale de `STORAGE_STATE` y `baseURL` de `PLAYWRIGHT_BASE_URL` (por defecto `http://127.0.0.1:4317`, el dev local). Así un arranque accidental no pega a producción.

### Manejo de sesión (storage state)
- Login una vez → `context.storageState({ path: 'auth.json' })`.
- Reutilizar en ejecuciones posteriores (bots/rutinas).
- Validar sesión: comprobar elemento de “Mi panel” o endpoint `/api/me`.
- Si expira → un bot con secretos de entorno puede reloguear y regenerar el storage state. Este repositorio no lo hace: `isSessionExpired` solo detecta y corta, sin credenciales ni login real.

### Locators estables (orden de preferencia)
1. `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText` (accesibilidad).
2. `getByTestId` (si el frontend agrega `data-testid`).
3. CSS / XPath solo como último recurso y documentados.
- Evitar selectores frágiles (clases dinámicas, nth-child profundo).

### Page Object Model
```typescript
export class LoadsPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/cargas'); }
  async filterByRegion(region: string) {
    await this.page.getByRole('combobox', { name: /región/i }).selectOption(region);
    await this.page.waitForLoadState('networkidle');
  }
  async extractLoads() { /* structured extraction */ }
}
```

## Extracción estructurada

- Esperar contenido: `page.waitForSelector`, `locator.waitFor`, o `expect(locator).toBeVisible()`.
- Extraer tablas → array de objetos tipados.
- Normalizar: precios CLP (quitar puntos/comas), fechas ISO, pesos en kg/ton.
- Validar con schema (Zod o similar) antes de procesar.
- Guardar raw + clean + metadata (timestamp, URL, user role). En este repositorio el flujo de producción devuelve raw y clean en memoria (y los tests los retienen en el proceso). No escribe en disco de producción.

## Confiabilidad y manejo de errores

| Problema | Mitigación |
|----------|------------|
| Flakiness / timing | `expect` de Playwright, `waitForLoadState`, retries con backoff |
| Sesión expirada | Detectar redirect a `/ingreso` → relogin |
| Rate limiting / 429 | Exponential backoff + jitter, respetar robots.txt |
| Contenido dinámico (“Cargando…”) | Esperar ausencia del spinner + presencia de datos |
| Cambios de UI | POM + locators por rol/texto; alertas en CI |
| Fallos intermitentes | Trace viewer, video, screenshot en fallo |

Patrón de retry:
```typescript
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw new Error('unreachable');
}
```

## Integración con Grok Bots y rutinas

- Encapsular flujos en funciones reutilizables.
- Para rutinas recurrentes (resumen diario de cargas, monitoreo de panel, verificación de documentos):
  1. Bot mantiene storage state (solo por entorno; este repo no guarda la sesión).
  2. Ejecuta extracción.
  3. Compara con estado anterior (memoria del bot).
  4. Genera reporte Markdown/CSV/Excel en el entorno del bot, no en disco de producción.
  5. Notifica solo deltas o alertas.
- `scripts/generate_report.py` es un ejemplo local de formato. La rutina de este repositorio no lo llama y no programa un cron.

## Rutina de resumen para Grok Bots (este repositorio)

Flujo reutilizable y API-first. No hay cron nuevo y la rutina no llama a xAI (tampoco en CI).

1. Quien invoca entrega un `source` con datos ya obtenidos (módulo interno o API autorizada). `runPublicFaqSummary` lee `src/lib/faq.ts` en memoria: el mismo contenido público de `/faq`, sin HTTP a producción.
2. `guardAutomationRate` (`src/lib/web-automation/rate.ts`) aplica `rateLimit` de `src/lib/rate-limit.ts` antes de leer.
3. `withRetry` (`src/lib/web-automation/retry.ts`) reintenta fallos transitorios con backoff exponencial (`baseDelayMs * 2^intento`). No reintenta sesión expirada ni el 429 del propio límite.
4. `isSessionExpired` (`src/lib/web-automation/session.ts`) mira status 401, la URL final y `Location` hacia `/ingreso` o `/login`, y el texto explícito de sesión expirada. No hay login real ni credenciales. La sesión de browser, si existe, llega solo por `STORAGE_STATE`.
5. Cada fila pasa por `keepRawAndClean`: CLP a entero y fecha a `YYYY-MM-DD`, validadas con zod. `{ raw, clean }` queda en memoria.
6. `renderSummary` devuelve el Markdown. Este código no escribe disco.

Código: `runSummaryRoutine` en `src/lib/web-automation/routine.ts`.

UI de ejemplo, solo si no hay API: Page Object `e2e/faq.page.ts` sobre `/faq` (ruta pública ya existente). Locators con `getByRole` (`main`, heading, button, link).

Playwright (`playwright.config.ts`): `storageState` desde `STORAGE_STATE` (si falta, sin sesión); `trace: 'on-first-retry'`; `screenshot: 'only-on-failure'`; `retries: 2`.

El e2e no corre en CI (el workflow no instala browser). Script local, con el dev server arriba: `npm run test:e2e`. Los tests de schema, retry, rate limit y ausencia de credenciales sí corren en `npm test`.

## Observabilidad y debugging

- Habilitar `trace: 'on-first-retry'`.
- Screenshots en puntos críticos y en fallo.
- Logs estructurados: `{ step, url, duration, status, error }`.
- En bots: guardar artefactos (trace.zip, screenshots) en workspace para revisión.

## Seguridad y compliance

- Credenciales solo vía env / secretos del entorno del bot.
- No scrapear más allá de lo necesario; preferir APIs.
- Respetar roles (mandante / transportista / admin) y RLS.
- Auditoría: registrar quién ejecutó qué automatización y cuándo.
- No automatizar acciones de alto riesgo (publicar, cambiar DNS, enviar masivos) sin autorización explícita.

## Cuándo usar navegador vs API

| Caso | Preferir |
|------|----------|
| Listar cargas / camiones | API si existe; si no, UI con POM |
| Calculadora de flete | API de cotización |
| Login / sesión | Storage state |
| Verificación visual / E2E | UI |
| Monitoreo de alertas panel | UI o endpoint de notificaciones |
| Extracción masiva | API + paginación |

## Checklist antes de dejar una automatización en producción (bot)

- [ ] Storage state o login automático fiable
- [ ] Locators estables y documentados
- [ ] Manejo de errores + retries
- [ ] Extracción validada con schema
- [ ] Rate limiting respetado
- [ ] Artefactos de debug (trace/screenshot)
- [ ] Sin credenciales en código
- [ ] Prueba manual + al menos un caso de fallo simulado
- [ ] Documentado en el skill / memoria del bot

Ver también: `references/browser-automation.md` (flujo base), `references/integrations-and-automation.md` (canales y webhooks), `references/security-privacy-and-release.md`.
