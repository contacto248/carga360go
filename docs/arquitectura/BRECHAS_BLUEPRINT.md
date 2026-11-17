# Brechas del blueprint v1.0 frente al Next.js

Contraste entre el blueprint de Gerencia (17 noviembre 2026) y el código de esta rama, `release/2026-11-15`. Fuentes:

- `docs/arquitectura/blueprint-v1.0/Carga360GO_Arquitectura_AI_Automatizaciones_v1.docx` y la transcripción `docs/arquitectura/blueprint-v1.0/Carga360GO_Arquitectura_AI_Automatizaciones_v1.md`.
- Paquete de referencia, copiado tal cual y sin cablear, en `docs/arquitectura/blueprint-v1.0/plataforma/`.

Este documento no implementa streams, no agrega dependencias y no modifica `src/`, los tests, las migraciones ni `src/app/admin/ops/`.

## Secretos

El docx no trae claves, tokens, contraseñas ni un `.env`. Las palabras «secretos» y «tokens» del texto son requisitos de arquitectura (secret manager, telemetría de coste), no valores.

El paquete incluye `plataforma/.env.example` solo con placeholders: `POSTGRES_PASSWORD=change-this-db-password` y `C360_API_KEY=change-me-now`. No hay claves reales. Se conserva el archivo. Los mismos placeholders figuran como valor por defecto de demostración en `plataforma/docker-compose.yml`, `plataforma/services/api/main.py`, `plataforma/apps/web/index.html` y `plataforma/README.md`.

## 1. Qué del blueprint ya existe, y dónde

### FastAPI

No existe en la aplicación. El runtime es Next.js 15 (`package.json`: `next`, `react`, `better-sqlite3`, `zod`). No están `fastapi`, `uvicorn` ni `psycopg`.

El paquete de referencia, solo como documentación, trae una API FastAPI en `docs/arquitectura/blueprint-v1.0/plataforma/services/api/main.py` (`Carga360GO Core API`, versión `1.0.0`). Expone `GET /health`, `GET /overview`, `GET /agents`, `POST /freight`, `GET /freight`, `POST /freight/{fid}/quote`, `POST /freight/{fid}/operation`, `GET /operations`, `POST /operations/{oid}/assign`, `POST /approvals/{aid}/approve`, `POST /operations/{oid}/tracking`, `POST /operations/{oid}/incidents`, `GET /audit` y `POST /ai/orchestrate`. El `docker-compose.yml` del mismo paquete no forma parte del arranque de Next.

Las rutas reales de la app viven en `src/app/api/**/route.ts`.

### Postgres

No es el almacén de la app. El system of record es SQLite, abierto con `better-sqlite3` en `src/lib/db.ts`. El workflow `.github/workflows/ci.yml` fija `DATABASE_PATH` a un archivo sqlite.

El blueprint (principio «System of Record» y sección 6) pide PostgreSQL. El paquete declara `postgres:17` en `plataforma/docker-compose.yml` y el DDL en `plataforma/infra/schema.sql`. Esa base no está creada ni referenciada desde `src/`.

### Diez agentes

El catálogo del blueprint (sección 3) y el diccionario `AGENTS` de `plataforma/services/api/main.py` nombran diez agentes: `MASTER`, `SALES`, `OPS`, `DISPATCH`, `TRACK`, `GUARDIAN`, `DOC`, `CUSTOMER`, `CARRIER` y `ANALYST`, cada uno con una lista corta de herramientas. Ese catálogo y el `POST /ai/orchestrate` no están en `src/`. Tampoco hay AI Gateway, Intent Router, Policy Engine ni Model Router (sección 9 del blueprint).

Lo que sí hay son otros agentes, con otro alcance:

| Pieza en Next | Dónde | Qué hace |
| --- | --- | --- |
| Agente comercial de voz | `src/lib/agent/` (`engine.ts`, `tools.ts`, `voice.ts`), `src/app/api/agente/route.ts`, `src/app/api/agente/telefono/route.ts` | Conversación, leads y herramientas de `AGENT_TOOLS`. `AGENT_ENABLED` nace apagado en `src/lib/agent/config.ts`. |
| AI.CARGA360 | `src/lib/agente360/`, `src/app/agente-360go/`, `src/app/api/agente-360go/route.ts` | Asistente con modelo. No es el orquestador de diez agentes. |
| Calidad Bassam | `src/lib/bassam/quality.ts`, `src/app/api/bassam/agente/route.ts` | Reglas sobre un viaje. Severidad muy alta queda en `pendiente_gerente`. |
| WhatsApp | `src/lib/whatsapp/bot.ts` | Bot apagado salvo `WA_BOT_ENABLED=true` (`src/lib/whatsapp/config.ts`). |
| Chat web | `src/lib/chat/` | Apagado salvo `WEB_CHAT_ENABLED=true` (`src/lib/chat/config.ts`). |

### Approval Engine

No hay tabla `approvals` ni un motor con estados `PENDING → APPROVED/REJECTED/EXPIRED/CANCELLED` que frene cualquier mutación sensible.

El paquete sí lo esboza: `approvals` en `plataforma/infra/schema.sql`. En `main.py`, `POST /operations/{oid}/assign` inserta una aprobación y no asigna; `POST /approvals/{aid}/approve` aplica `operation.assign` solo entonces.

En Next hay decisiones humanas puntuales, no ese motor:

- La asignación operativa queda en propuesta. `allocationMode()` en `src/lib/ops/flags.ts` devuelve siempre `"propuesta"`. La confirmación está en `src/app/api/ops/asignacion/[runId]/confirmar/route.ts` y el módulo en `src/lib/ops/allocation.ts`.
- Contratos y tarifas se aprueban en `src/lib/ops/procurement.ts`, con rutas `src/app/api/ops/contratos/[id]/aprobar/route.ts` y `src/app/api/ops/tarifas/[id]/aprobar/route.ts`. Exigen `OPS_FEATURE_ENABLED` y el flag hijo de procurement.
- Bassam deja la severidad muy alta para gerencia en `src/lib/bassam/quality.ts`.
- Cuentas y documentos de acreditación se aprueban en `src/lib/accreditation.ts`.

La matriz Bajo / Medio / Alto / Crítico de la sección 10 no está codificada.

### Contrato MCP

Hay dos contratos distintos.

El que corre en Next es `src/app/api/mcp/route.ts`: JSON-RPC, bearer `MCP_TOKEN`, herramientas `resumen`, `listar_cargas` y `detalle_carga`. El detalle exige además `X-C360-Session` y que quien pregunta sea parte del viaje (`isTripParty` en `src/lib/viaje.ts`). Esa ruta lee SQLite (`loads`, `trip_events`, `ratings`) dentro del proceso. No publica las tools del blueprint.

El blueprint (sección 8) pide tools estrechas (`rfq.search/get/create`, `pricing.calculate`, `quote.create_draft`, `operation.get/create`, `assignment.propose`, y el resto de esa tabla) y prohíbe SQL genérico, shell y updates arbitrarios. El paquete trae un contrato más corto en `plataforma/mcp/tool-contract.json`, servidor `carga360-mcp`: `freight.list`, `freight.create`, `quote.calculate`, `operation.list`, `operation.assign` (approval), `tracking.write`, `incident.create`, `document.validate` (approval), `approval.request` y `audit.read`. No hay servidor MCP que las sirva. `main.py` es REST, no MCP.

### Esquema SQL

El esquema vivo es SQLite. La base está en `schemaV1` de `src/lib/db.ts` (`users`, `sessions`, `password_resets`, `loads`, `trucks`, `documents`) y las migraciones 1 a 29 se aplican en el mismo archivo. Las copias 014 a 029 están en `docs/migrations/`. La 029 es `docs/migrations/029-ops-torre.sql`, igual a `MIGRATION_29_SQL` (geocercas, ETA, alertas y enlace de seguimiento; PR #49). No hay migración 030.

Correspondencia aproximada, con otros nombres y sin el modelo del blueprint:

| Blueprint / `schema.sql` | En Next | Dónde |
| --- | --- | --- |
| `freight_requests` | `loads` (id UUID) | `src/lib/db.ts`, alta en `createLoad` de `src/lib/listings.ts` |
| `quotes` | `cost_quotes` y el motor determinista | `src/lib/costos/engine.ts`, migración 16 |
| `operations` | `ops_shipments` + `ops_events` | `MIGRATION_23_SQL` en `src/lib/db.ts`, lógica en `src/lib/ops/shipments.ts` |
| `tracking_events` | `trip_gps_points`, `ops_gps_receipts`, `ops_eta_snapshots`, `ops_geofences` | `src/lib/bassam/ops.ts`, `src/lib/ops/gps/schema.ts` (027), `MIGRATION_29_SQL` |
| `documents` de la operación | `documents` de acreditación del usuario | `schemaV1` en `src/lib/db.ts` |
| `audit_logs` | `audit_log` | migración 6 en `src/lib/db.ts`, escritura en `src/lib/audit.ts` |
| `tenants`, `memberships`, `policies` | no hay tenant; sí `users.role` y `ops_organizations` / `ops_org_members` | `src/lib/ops/organizations.ts`, migración 022 |
| `incidents`, `approvals`, `idempotency_keys`, `outbox_events`, `ai_runs`, `invoice_drafts` | no existen | — |

`plataforma/infra/schema.sql` define ocho tablas Postgres (`freight_requests`, `quotes`, `operations`, `tracking_events`, `incidents`, `documents`, `approvals`, `audit_logs`) con UUID y sin `tenant_id` ni `idempotency_key`. No está aplicado. Tampoco cubre el modelo mínimo de la sección 6 del blueprint.

Identificadores que ya se emiten, ninguno con la forma `360-YYMM-NNNN`:

- `loads.id` y `ops_shipments.id` son `randomUUID()` (`createLoad` en `src/lib/listings.ts`, `ensureShipmentForLoad` en `src/lib/ops/shipments.ts`).
- El lead del agente de voz es `C360-` más seis caracteres (`newLeadCode` en `src/lib/agent/store.ts`).
- El folio PDF es `C360-YYYYMMDD-` más ocho hex (`src/lib/registration-pdf.ts`).

Idempotencia que ya existe, y no es la del blueprint (cada comando mutable con `idempotency_key`):

- `ensureShipmentForLoad` devuelve el envío si esa carga ya tiene uno, y audita `ops.envio_creado` con `auditStrict`.
- El webhook Didit aplica el estado por `event_id` (`src/app/api/webhooks/didit/route.ts`).
- Mercado Pago manda `x-idempotency-key` (`src/lib/pagos/mp-client.ts`).

No hay tabla `idempotency_keys`. `audit_log` guarda actor, acción, objetivo, detalle e IP. No guarda `correlation_id`, `trace_id`, before/after ni el id de una aprobación.

## 2. Qué se porta a TypeScript y qué queda como servicio aparte

El core de esta release es el Next.js. El blueprint pide una sola autoridad transaccional y que el modelo no escriba la base. Portar `main.py` al lado de SQLite crearía una segunda autoridad. Por eso el paquete queda en `docs/` y no se importa desde `src/`.

Sobre el Next actual, en TypeScript, y solo detrás de un flag apagado por defecto:

- Validación con `zod`, del mismo modo que `src/lib/ops/shipments.ts`.
- Alta de operación con identificador público `360-YYMM-NNNN` (año en dos dígitos, mes, secuencia de cuatro). El UUID interno se mantiene.
- `idempotency_key`: la misma clave y el mismo cuerpo devuelven la misma operación; otra carga con la misma clave se rechaza.
- Auditoría reutilizando `auditStrict` en `src/lib/audit.ts`.
- Reglas allow / deny / approval como funciones puras, antes de escribir.
- Cotización con `src/lib/costos/engine.ts`. No se porta la fórmula de demostración de `main.py` (`distancia × 1.35 + peso × 0.03`, margen 18).
- Los estados que ya tiene el envío (`negociacion`, `asignacion`, `ejecucion`, `pod`, `auditoria`, `facturacion`, `pago`, `cerrado`, `cancelado` en `SHIPMENT_STAGES`) se respetan. La máquina `ORDER` / `TRIP` del blueprint no se abre en paralelo en el primer stream.
- GPS, geocerca y ETA ya están en `src/lib/ops/gps/` y `src/lib/ops/eta.ts` (migraciones 027 y 029). Un stream posterior los consulta.

Conviene dejarlo como servicio aparte, sin cablearlo a esta app:

- El proceso FastAPI, Postgres 17 y nginx de `plataforma/`. Son la referencia, no un segundo core.
- AI Gateway, router de modelos y orquestador de los diez agentes. Hablan HTTP con el core. El agente de voz y AI.CARGA360 siguen siendo los productos actuales; no son ese orquestador.
- Bus de eventos, workers, DLQ y outbox. `package.json` no trae Redis ni Kafka, y el Next atiende requests.
- El servidor MCP de `tool-contract.json`, como adaptador. No se amplía `src/app/api/mcp/route.ts` con escritura SQL de cargas u operaciones. Las tools nuevas, cuando existan, llaman la API.
- OCR, object storage y warehouse.
- Si más adelante el system of record pasa a PostgreSQL, se migra el core único. No se levanta `schema.sql` al lado de SQLite.

## 3. Orden de streams

Cada stream nace detrás de su flag, apagado. La convención es la de `src/lib/ops/flags.ts`: solo el texto exacto `true` enciende un flag. Un hijo además exige el maestro `BLUEPRINT_FEATURE_ENABLED=true`. Este PR no declara esos flags en código y no enciende `OPS_FEATURE_ENABLED`, `PAYMENTS_FEATURE_ENABLED` ni `KYC_FEATURE_ENABLED`.

La sección 16 del blueprint permite trabajo en paralelo cuando el contrato ya existe. El orden de abajo es el propuesto para este repositorio.

1. `BLUEPRINT_STREAM_01_OPERATION_ENABLED`. Validación de datos, creación de la operación, identificador `360-YYMM-NNNN`, idempotencia y auditoría. Las migraciones de este stream parten en **030**. La 029 ya está usada por el #49 (`docs/migrations/029-ops-torre.sql`). No se implementa en este PR y no toca `src/app/admin/ops/` (ese panel es el PR #50).
2. `BLUEPRINT_STREAM_02_TENANT_ENABLED`. `tenant_id` en la operación nueva. Hoy no hay tenants; hay `users.role` y organizaciones en `src/lib/ops/organizations.ts` (migración 022).
3. `BLUEPRINT_STREAM_03_QUOTE_ENABLED`. Borrador de cotización por el motor de `src/lib/costos`. El precio no sale de un modelo.
4. `BLUEPRINT_STREAM_04_APPROVAL_ENABLED`. Approval Engine: la acción sensible queda pendiente y no muta hasta una persona. No sustituye, en este documento, la confirmación de `src/lib/ops/allocation.ts`.
5. `BLUEPRINT_STREAM_05_MATCHING_ENABLED`. Ranking y propuesta, sin confirmar. No enciende `OPS_ALLOCATION_ENABLED` ni `OPS_ALLOCATION_AUTO`.
6. `BLUEPRINT_STREAM_06_TRACKING_ENABLED`. Posición y ETA sobre lo ya migrado en 027 y 029. No reemplaza la torre del #49.
7. `BLUEPRINT_STREAM_07_DOCUMENTS_ENABLED`. Metadatos, validación y expiración de documentos de la operación. Los `documents` actuales son de acreditación del usuario.
8. `BLUEPRINT_STREAM_08_INCIDENTS_ENABLED`. Apertura y escalamiento. No hay tabla `incidents`.
9. `BLUEPRINT_STREAM_09_BILLING_ENABLED`. Cargos y borrador de factura. No enciende `PAYMENTS_FEATURE_ENABLED` (`src/lib/pagos/config.ts`).
10. `BLUEPRINT_STREAM_10_EVENTS_ENABLED`. Outbox y contrato de eventos. El worker queda fuera del proceso Next.
11. `BLUEPRINT_STREAM_11_MCP_ENABLED`. Publicar `plataforma/mcp/tool-contract.json` como adaptador HTTP, sin herramienta de SQL.
12. `BLUEPRINT_STREAM_12_AGENTS_ENABLED`. Los diez agentes y el orquestador, en el servicio aparte, cada uno con la allowlist de `main.py`. El core sigue rechazando mutaciones que no pasen por API, política y aprobación.
13. `BLUEPRINT_STREAM_13_ANALYTICS_ENABLED`. KPIs de solo lectura. No hay warehouse.

Las migraciones posteriores a la 030 se numeran cuando se implemente cada stream. Este PR no agrega SQL en `docs/migrations/` ni cambia `src/lib/db.ts`.
