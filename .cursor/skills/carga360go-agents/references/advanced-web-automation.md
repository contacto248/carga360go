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

### Manejo de sesión (storage state)
- Login una vez → `context.storageState({ path: 'auth.json' })`.
- Reutilizar en ejecuciones posteriores (bots/rutinas).
- Validar sesión: comprobar elemento de “Mi panel” o endpoint `/api/me`.
- Si expira → relogin automático y regenerar storage state.

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
- Guardar raw + clean + metadata (timestamp, URL, user role).

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
  1. Bot mantiene storage state.
  2. Ejecuta extracción.
  3. Compara con estado anterior (memoria del bot).
  4. Genera reporte Markdown/CSV/Excel.
  5. Notifica solo deltas o alertas.
- Usar `scripts/` del skill para formateo de reportes.

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
