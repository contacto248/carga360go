# Pago de fletes con Mercado Pago (Split 1:1) — notas técnicas

Estado: **solo modo prueba**, rama `feature/pagos-mp`. Con `PAYMENTS_FEATURE_ENABLED` distinto de `true` no aparece nada:
las páginas `/panel/pagos`, `/pagos/resultado` y `/admin/pagos` responden 404, las rutas `/api/pagos/*` responden 403,
el webhook responde 200 sin tocar la base y la migración de pagos no se aplica.

## Piezas

| Archivo | Qué hace |
|---|---|
| `src/lib/pagos/config.ts` | Flag, entorno (`test`/`production`) y reglas configurables. Solo lee variables de entorno. |
| `src/lib/pagos/schema.ts` + `deploy/migrations/pagos-mp-001.sql` | Migración separada (tabla de versiones propia). La aplica el código de pagos solo con el flag encendido. |
| `src/lib/pagos/state.ts` | Máquina de estados del flete y de cada cuota (spec §8). Funciones puras. |
| `src/lib/pagos/amounts.ts` | Anticipo/saldo y recargo estimado del medio (spec §5.3). |
| `src/lib/pagos/business-hours.ts` | Ventana de reclamo en horas hábiles, zona America/Santiago, feriados por variable. |
| `src/lib/pagos/crypto.ts` | AES-256-GCM de los tokens OAuth, con versión y clave anterior para rotar. |
| `src/lib/pagos/webhook.ts` | Validación `x-signature` (HMAC-SHA256, tiempo constante, tolerancia de 300 s) y parseo. |
| `src/lib/pagos/mp-client.ts` | OAuth, refresh, preferencias, GET de pago y reembolsos (con `X-Idempotency-Key`). Fetch inyectable para pruebas. |
| `src/lib/pagos/service.ts` | Reglas de negocio y acceso a datos. |
| `src/lib/pagos/webhook-handler.ts` | Webhook: firma → registro/deduplicación → 200 → GET del pago en segundo plano. |
| `tests/pagos-mp.test.ts` + `tests/fixtures/mp-webhooks/` | Pruebas con respuestas simuladas; ninguna llamada sale a Mercado Pago. |

## Rutas

Las de la spec §10 bajo `/api/pagos/...` (más `POST /api/pagos/admin/fletes/:id/cancelar`).
No se tocaron `/api/auth`, `/api/me` ni ninguna ruta móvil, formularios ni Términos.

## Jobs (cron del servidor, cuando se habilite staging)

```
POST /api/pagos/jobs/cerrar-ventanas   Authorization: Bearer $PAYMENTS_CRON_SECRET   (cada 15 min)
POST /api/pagos/jobs/renovar-tokens    Authorization: Bearer $PAYMENTS_CRON_SECRET   (diario)
```

## Probar

`npm test` (incluye `tests/pagos-mp.test.ts`).
