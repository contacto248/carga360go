# API OPS v1 — lectura

API de solo lectura del núcleo operativo. No crea contratos, no adjudica envíos y no cobra.

Está apagada por defecto. Responde **404** (`{"error":"No encontrado."}`) si `OPS_FEATURE_ENABLED` no es exactamente `true` o si `OPS_API_V1_ENABLED` no es exactamente `true`. Un flag hijo no vale con el maestro apagado. `TRUE`, `1` o vacío quedan apagados.

No usa claves de servicio nuevas. La sesión es la que ya existe:

- Cookie `c360_session` (la misma de la web).
- O `Authorization: Bearer <token>` de `/api/auth/login`. Si viene Bearer, la cookie se ignora.

Un administrador de plataforma necesita la sesión con el segundo factor, igual que el resto de `/admin`. Sin sesión la respuesta es **401** `{"error":"Debes iniciar sesión."}`.

Los permisos son los de la organización (`src/lib/ops/permissions.ts`):

| Ruta | Quién puede leer |
|---|---|
| `GET /api/ops/v1/contratos` | `tarifas.ver` en la organización, o admin de plataforma |
| `GET /api/ops/v1/tarifas` | `tarifas.ver` en la organización, o admin de plataforma |
| `GET /api/ops/v1/envios/{id}` | admin de plataforma, u `org_admin` / `trafico` activo de una organización del envío |
| `GET /api/ops/v1/asignaciones/{runId}` | admin de plataforma, o `asignacion.ver` en la organización de la regla |

Un `orgId` de otra organización responde **403**. Un envío o una propuesta que no existe, o que el rol no puede ver, responde **404**. La propuesta no revela si el identificador existe.

`GET /api/ops/v1/contratos` y `GET /api/ops/v1/tarifas` aceptan `orgId` (UUID). Sin ese parámetro, la respuesta trae solo las organizaciones donde la sesión tiene `tarifas.ver`. El admin ve todas.

Los montos (`amountClp`, `rateClp`) van en esta API autenticada. No se publican en páginas públicas.

La especificación está en `docs/ops/openapi-v1.yaml` (OpenAPI 3.1). El test `tests/ops-panel.test.ts` la parsea y comprueba que cada ruta tenga su archivo.

Caché: `cache-control: no-store`. Solo `GET`.
