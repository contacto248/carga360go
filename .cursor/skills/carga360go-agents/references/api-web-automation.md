---
description: "Integración API-first para CARGA360GO: cliente HTTP tipado, retries con backoff, 401/429/5xx, logs y Playwright APIRequestContext. El navegador queda como fallback."
connections: [advanced-web-automation, browser-automation, integrations-and-automation, components-and-apis]
---

# API Web Automation — Cliente tipado

Complemento de `references/advanced-web-automation.md`. Misma regla: si hay endpoint estable, usarlo. El navegador (POM, `getByRole`, storage state) solo cubre lo que la API no expone o una verificación visual.

En este repositorio el backoff, la sesión expirada, el rate limit y el schema de CLP/fechas ya viven en `src/lib/web-automation/`. Este manual fija el contrato HTTP. No programa cron y no llama a xAI.

## Principios

1. Base URL y token solo por entorno (`CARGA360_API_BASE`, `CARGA360_API_TOKEN`). Si el token no está, la llamada va sin `Authorization`.
2. Nunca escribir el token, cookies ni `STORAGE_STATE` en logs, reportes o el repo.
3. Validar el JSON con un schema (Zod) antes de usarlo. Normalizar CLP a entero y fechas a `YYYY-MM-DD`, igual que la extracción de UI.
4. Reintentar solo lo transitorio. Un 401 corta. Un 4xx de negocio no se reintenta.
5. Respetar el rate limit propio (`src/lib/rate-limit.ts` vía `guardAutomationRate`) y el 429 del servidor.

## Cliente HTTP tipado

```typescript
type ApiFailure = "unauthorized" | "rate_limited" | "server" | "client";

type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; kind: ApiFailure; retryAfterMs?: number };

type Schema<T> = { parse: (data: unknown) => T };

function apiBase(): string {
  return (process.env.CARGA360_API_BASE ?? "http://127.0.0.1:4317").replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const token = process.env.CARGA360_API_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const when = Date.parse(header);
  if (Number.isNaN(when)) return undefined;
  return Math.max(0, when - Date.now());
}

async function readJson(response: { status: number; headers: () => Record<string, string>; json: () => Promise<unknown> }, schema: Schema<unknown>): Promise<ApiResult<unknown>> {
  const status = response.status;
  if (status === 401) return { ok: false, status, kind: "unauthorized" };
  if (status === 429) {
    return { ok: false, status, kind: "rate_limited", retryAfterMs: retryAfterMs(response.headers()["retry-after"] ?? null) };
  }
  if (status >= 500) return { ok: false, status, kind: "server" };
  if (status >= 400) return { ok: false, status, kind: "client" };
  return { ok: true, status, data: schema.parse(await response.json()) };
}
```

El resultado es un valor tipado. El llamador no inspecciona HTML.

## Retries y backoff

Misma curva que `withRetry` en `references/advanced-web-automation.md` y en `src/lib/web-automation/retry.ts`: espera `baseDelayMs * 2^intento` (base 1000 ms). El jitter es opcional y acotado.

| Status | Qué hacer |
|--------|-----------|
| 401 | Sesión expirada. No reintentar y no reloguear desde este repo: no hay credenciales. Avisar y cortar. En UI equivale al redirect a `/ingreso` (`isSessionExpired`). |
| 429 | Rate limit. Esperar `Retry-After` si viene; si no, backoff. No disparar otra ráfaga. |
| 5xx | Transitorio. Reintentar con backoff, tope 3 intentos, y registrar el fallo. |
| Otro 4xx | Error de la petición. No reintentar. |
| Red / timeout | Tratarlo como 5xx. |

```typescript
const RETRYABLE = new Set<ApiFailure>(["rate_limited", "server"]);

async function withApiRetry<T>(fn: () => Promise<ApiResult<T>>, attempts = 3): Promise<ApiResult<T>> {
  for (let i = 0; i < attempts; i++) {
    const result = await fn();
    const again = !result.ok && RETRYABLE.has(result.kind) && i < attempts - 1;
    if (!again) return result;
    const wait = result.kind === "rate_limited" && result.retryAfterMs != null
      ? result.retryAfterMs
      : 1000 * 2 ** i;
    await new Promise((r) => setTimeout(r, wait));
  }
  return { ok: false, status: 0, kind: "server" };
}
```

## Logs

Un objeto por intento, sin headers de auth ni cuerpo con datos personales:

```typescript
function logApi(entry: { step: string; url: string; duration: number; status: number; error?: string }) {
  console.info(JSON.stringify({ ...entry, at: new Date().toISOString() }));
}
```

No imprimir `CARGA360_API_TOKEN`, cookies, ni `Authorization`.

## Playwright `APIRequestContext`

El contexto de API reutiliza `baseURL` y, si hace falta, `storageState` del `playwright.config.ts` (`STORAGE_STATE`). No abre página.

```typescript
import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { z } from "zod";

const healthSchema = z.object({ ok: z.literal(true) });

async function withApi(run: (api: APIRequestContext) => Promise<void>) {
  const api = await playwrightRequest.newContext({
    baseURL: process.env.CARGA360_API_BASE ?? "http://127.0.0.1:4317",
    extraHTTPHeaders: authHeaders(),
  });
  try {
    await run(api);
  } finally {
    await api.dispose();
  }
}

async function getHealth(api: APIRequestContext) {
  const started = Date.now();
  const response = await api.get("/api/salud");
  const status = response.status();
  logApi({ step: "getHealth", url: "/api/salud", duration: Date.now() - started, status });
  return withApiRetry(async () => readJson(
    { status, headers: () => response.headers(), json: () => response.json() },
    healthSchema,
  ), 1);
}
```

`/api/salud` responde `{ ok: true }` sin sesión. `/api/me` exige sesión: un 401 se trata como sesión expirada, no como un fallo para reintentar a ciegas. La calculadora y las cotizaciones, cuando se automaticen, van por su endpoint (`/api/estimacion`, `/api/cotizaciones`) y no por el formulario.

Dentro de un test de Playwright el fixture `request` ya es un `APIRequestContext`. Ese e2e no corre en CI.

## API vs UI

| Caso | API | UI (fallback) |
|------|-----|----------------|
| Salud del servicio | `GET /api/salud` | No aplica |
| Sesión vigente | `GET /api/me` → 401 si expiró | Redirect a `/ingreso` o texto de sesión expirada |
| Listar cargas / camiones | Endpoint estable + paginación | POM sobre la ruta pública |
| Calculadora de flete | API de cotización / estimación | `/herramientas/calculadora` |
| FAQ / resumen | Datos ya en módulo o API | `e2e/faq.page.ts` sobre `/faq`, locators `getByRole` |
| Verificación visual | No | Trace `on-first-retry`, screenshot `only-on-failure` |
| Extracción masiva | API + paginación y rate limit | No scrapear el HTML |
| Login | Token o storage state por entorno | No hardcodear usuario ni clave |

## Checklist

- [ ] El flujo usa API si el endpoint existe
- [ ] Cliente tipado y respuesta validada con schema
- [ ] 401 corta sin relogin ni credenciales en el código
- [ ] 429 respeta `Retry-After` o backoff; 5xx reintenta con backoff
- [ ] 4xx de negocio no se reintenta
- [ ] Logs con step, url, duration, status y error; sin token ni cookies
- [ ] Rate limit propio aplicado antes de la ráfaga
- [ ] `baseURL` y token solo por entorno; default local `http://127.0.0.1:4317`
- [ ] Raw y clean en memoria, no en disco de producción
- [ ] Sin cron contra producción y sin llamada a xAI
- [ ] Documentado junto a `references/advanced-web-automation.md`

Ver también: `references/advanced-web-automation.md`, `references/browser-automation.md`, `references/integrations-and-automation.md`, `references/security-privacy-and-release.md`.
