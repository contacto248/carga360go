# Especificación PR — migración ops_operation_alerts — Carga360go

**Estado:** propuesta **aprobada para PR** por JEFE BASTIAN (17-11-2026). Lista para que la implemente Cursor. Solo documento: no se tocó el repo ni producción.
**Fecha:** 17-11-2026 (hora de Chile, UTC-3)
**Base de código:** `origin/release/2026-11-15` en `f5b5893` (merge del PR #59), tras `git fetch --all --prune` a las 08:27 (hora de Chile)
**Relacionados (misma carpeta):** `CATALOGO_INCIDENCIAS_ALERTAS.md`, `CASOS_PRUEBA_INCIDENCIAS.md`, `fixtures_incidencias_EJEMPLO.json`, `CORRECCION_PLAN_QA_UMBRALES.md`

---

## 1. Identificación de la migración: por NOMBRE, no por número

La migración se identifica como **migración ops_operation_alerts** (tabla `ops_operation_alerts` con `closed_at`/`closed_by`). En el SQL, las rutas y el código se usa el marcador **`NNN`**: `NNN-ops-operation-alerts.sql`, `NNN-ops-operation-alerts-rollback.sql`, `MIGRATION_NNN_SQL`, `MIGRATION_NNN_COLUMN_SQL` y `hasMigration(db, NNN)`. **Cursor asigna NNN al abrir el PR**, con el siguiente número libre de `docs/migrations/` y de `src/lib/db.ts`, y lo reemplaza en todos los lugares marcados.

| Comprobación (fetch de las 08:27, hora de Chile) | Resultado |
|---|---|
| Migraciones en `docs/migrations/` de la release `f5b5893` | La más alta es `032-ai-router-uso.sql` (`ai_router_usage`, PR #59) |
| `hasMigration(db, N)` en `src/lib/db.ts` de la release | Llega a 32 (`src/lib/db.ts:1342`) |
| Ramas remotas (`origin/*`) | Ninguna tiene una migración por encima de la 32 |

> **Nota informativa:** al 17-11-2026 08:27, el siguiente número libre sería **033**. Es solo referencia; el número definitivo lo fija Cursor.

Producción (dato **informado por JEFE BASTIAN, 08:16**, no verificado): `be067cb`, con las migraciones 22 a 31 aplicadas. La 032 (`ai_router_usage`) todavía no estaría en producción. El bloque de esta migración comprueba su propio número (`hasMigration(db, NNN)`) y no el máximo, igual que la 030, la 031 y la 032, así que no depende del orden de llegada.

> ⚠️ **CONTRATO ESTABLE — no renombrar.** Las columnas **`closed_at`, `closed_by` y `close_reason`** de `ops_operation_alerts` las consume **INTELIGENCIA para el KPI-11** (usa `closed_at`). Sus nombres, su tipo (`TEXT`; `closed_at` en ISO 8601 UTC) y sus valores (`close_reason` ∈ `condicion_resuelta`, `resuelta_manual`, `descartada`, `duplicada`) son un contrato. Cualquier cambio requiere acordarlo antes con INTELIGENCIA y con JEFE BASTIAN.

---

## 2. Alcance

**Entra:**
1. La tabla `ops_operation_alerts` para las 16 incidencias del catálogo. `kind` también admite los 3 existentes, para una unificación futura.
2. La columna `ops_shipments.operation_id`: el eslabón que falta del vínculo de la decisión 5 (ver §3).
3. `OPS_ALERTA_ATRASO_MIN` (por defecto 30) y las claves de umbral de los kinds nuevos.
4. La biblioteca `operation-alerts.ts`, el evaluador automático de las incidencias **P1**, el registro manual de las incidencias manuales **P2** (`siniestro`, `rechazo_entrega`, `entrega_con_reparos`, `sin_contacto`) y el cierre con rastro.
5. El flag hijo `OPS_INCIDENCIAS_ENABLED`, que depende de `OPS_FEATURE_ENABLED`.

**No entra (PR posteriores):**
- los evaluadores automáticos de `documento_faltante` y `cierre_pendiente` (P2);
- todo lo P3 (`cambio_no_verificado`, `incidente_seguridad`, `temperatura_fuera_rango`, `diferencia_costo`). Su `kind` queda admitido en el `CHECK`, pero no se escriben filas;
- cambios a `ops_alerts`: los 3 kinds de la torre siguen escribiéndose **solo** en `ops_alerts`;
- claves y secretos (no se crea ni se propone ningún valor), pagos, DNS, textos legales y envíos externos.

---

## 3. Vínculo operación → envío → transportista (decisión 5)

| Eslabón | Existe en `f5b5893` | Dónde |
|---|---|---|
| Operación `360-YYMM-NNNN` | **Sí**: `ops_operations.id` es el código público | `docs/migrations/030-ops-operacion.sql`; `src/lib/db.ts:717`; lo arma `codigoOperacion()` en `src/lib/ops/operacion.ts:83`, con el YYMM en America/Santiago (PR #58) |
| Envío → operación (`operation_id`) | **NO EXISTE.** `ops_shipments` no tiene `operation_id`. El único `operation_id` del código está en `ops_operation_keys`, que es idempotencia (`src/lib/db.ts:734`). | — |
| Envío → asignación vigente | **Sí**: `ops_shipments.assigned_offer_id` → `offers.id` (`offers.status`) | `docs/migrations/023-ops-envios.sql`; `src/lib/db.ts:961` (`offers`) |
| Asignación → transportista | **Sí**: `offers.carrier_id` → `users.id` → `transportistas.user_id` | `src/lib/db.ts:964`; `docs/migrations/017-bassam-tablas.sql:19-33` |
| Transportista → documentos | **Sí**: `documentos_acreditacion.transportista_id` | `docs/migrations/017-bassam-tablas.sql:35-46` |
| `ops_shipments.carrier_org_id` | Existe, pero apunta a `ops_organizations` y **no** tiene vínculo con `transportistas` | `docs/migrations/022-ops-organizaciones.sql` |

**Lo que falta exactamente:**
1. La columna `ops_shipments.operation_id`, con su índice. La agrega esta migración (§4); no se crea ninguna tabla para el vínculo.
2. Un camino de código que la escriba: `linkShipmentToOperation()` en `shipments.ts`, auditado, con permiso operativo (§5).
3. Una regla explícita de «asignación vigente»: `ops_shipments.assigned_offer_id` cuya `offers.status = 'aceptada'`. El transportista se obtiene por `offers.carrier_id = transportistas.user_id`. Si hay 0 o más de 1 `transportistas` para ese usuario, no se evalúan los documentos y queda en la evidencia `{"vinculo":"sin_transportista_unico"}`.

Fuera de alcance: `ops_operations.estado` sigue admitiendo solo `'planificada'`.

---

## 4. SQL propuesto

Sigue el estilo de la 029 y la 031: encabezado con el número, quién la aplica, qué no toca y dónde está la reversa; `IF NOT EXISTS`; sin filas de ejemplo.

### 4.1 `docs/migrations/NNN-ops-operation-alerts.sql`

```sql
-- Migración NNN (ops_operation_alerts): alertas de operación (incidencias) y vínculo envío → operación.
-- La aplica src/lib/db.ts (MIGRATION_NNN_SQL y MIGRATION_NNN_COLUMN_SQL) al arrancar, si aún no está la versión NNN.
-- NNN lo asigna Cursor al abrir el PR (siguiente número libre).
-- Aditiva: una tabla nueva con sus índices y una columna nullable en ops_shipments.
-- No modifica ops_alerts, ops_alert_rules, ops_geofences, ops_tracking_links, ops_operations,
-- users, loads, offers, trip_events, trip_gps_points ni las migraciones 022 a 032. No inserta filas de ejemplo.
-- Los kinds atraso, detencion y sin_senal se siguen escribiendo solo en ops_alerts (029/031).
-- El enlace público (/seguimiento/{token}) no lee esta tabla.
-- ops_shipments.operation_id no declara REFERENCES para que la reversa pueda usar DROP COLUMN;
-- la existencia en ops_operations la valida src/lib/ops/shipments.ts.
-- Reversa: docs/migrations/NNN-ops-operation-alerts-rollback.sql

CREATE TABLE IF NOT EXISTS ops_operation_alerts (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  operation_id TEXT REFERENCES ops_operations(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'atraso', 'detencion', 'sin_senal',
    'desvio_geocerca', 'espera_destino', 'siniestro', 'rechazo_entrega', 'entrega_con_reparos',
    'documento_vencido', 'documento_faltante', 'sin_asignar', 'retiro_no_iniciado', 'cambio_no_verificado',
    'sin_contacto', 'evidencia_faltante', 'cierre_pendiente', 'diferencia_costo', 'temperatura_fuera_rango',
    'incidente_seguridad'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('baja', 'media', 'alta')),
  status TEXT NOT NULL CHECK (status IN ('abierta', 'cerrada')),
  source TEXT NOT NULL CHECK (source IN ('automatica', 'manual')),
  evidence_json TEXT NOT NULL,
  opened_by TEXT,
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  closed_by TEXT,
  close_reason TEXT CHECK (close_reason IS NULL OR close_reason IN ('condicion_resuelta', 'resuelta_manual', 'descartada', 'duplicada')),
  CHECK (
    (status = 'abierta' AND closed_at IS NULL AND close_reason IS NULL)
    OR (status = 'cerrada' AND closed_at IS NOT NULL AND close_reason IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_ops_operation_alerts_shipment ON ops_operation_alerts(shipment_id, status);
CREATE INDEX IF NOT EXISTS idx_ops_operation_alerts_operation ON ops_operation_alerts(operation_id, status);
CREATE INDEX IF NOT EXISTS idx_ops_operation_alerts_kind ON ops_operation_alerts(kind, status, opened_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_operation_alerts_open ON ops_operation_alerts(shipment_id, kind) WHERE status = 'abierta';

-- Vínculo envío → operación. En db.ts va aparte, con guarda hasColumn, como la 031.
ALTER TABLE ops_shipments ADD COLUMN operation_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ops_shipments_operation ON ops_shipments(operation_id);
```

Notas:
- `opened_by` y `closed_by` llevan el `users.id` del actor, o NULL cuando actúa el evaluador. Es el mismo criterio que `ops_events.actor_id`.
- `close_reason='condicion_resuelta'` es el cierre automático. Los otros tres valores exigen un actor humano (se valida en el código).
- No hay `DELETE`: borrar es Nivel 3 y no se expone.

### 4.2 `docs/migrations/NNN-ops-operation-alerts-rollback.sql`

```sql
-- Reversa de la migración NNN, ops_operation_alerts (alertas de operación y vínculo envío → operación).
-- Quita solo ops_operation_alerts con sus índices, la columna ops_shipments.operation_id con su índice,
-- y la fila NNN de schema_migrations. No toca ops_alerts ni las migraciones 022 a 032.
-- Antes de correrla: respaldo de la base (los vínculos y las incidencias se pierden).

DROP INDEX IF EXISTS idx_ops_shipments_operation;
ALTER TABLE ops_shipments DROP COLUMN operation_id;
DROP INDEX IF EXISTS idx_ops_operation_alerts_open;
DROP INDEX IF EXISTS idx_ops_operation_alerts_kind;
DROP INDEX IF EXISTS idx_ops_operation_alerts_operation;
DROP INDEX IF EXISTS idx_ops_operation_alerts_shipment;
DROP TABLE IF EXISTS ops_operation_alerts;
DELETE FROM schema_migrations WHERE version = NNN;
```

`DROP COLUMN` necesita SQLite 3.35 o superior; ya lo usa la reversa de la 031. El índice se borra antes de la columna porque SQLite no deja quitar una columna indexada.

---

## 5. Cambios por archivo

| Archivo | Cambio |
|---|---|
| `docs/migrations/NNN-ops-operation-alerts.sql` / `-rollback.sql` | **Nuevos**, con el contenido de §4. |
| `src/lib/db.ts` | `export const MIGRATION_NNN_SQL` (tabla e índices) y `export const MIGRATION_NNN_COLUMN_SQL` (ALTER e índice), con un comentario JSDoc al estilo de la 031. En `migrate()`, después del último bloque existente (hoy el 32): `if (!hasMigration(db, NNN)) { db.transaction(() => { db.exec(MIGRATION_NNN_SQL); if (!hasColumn(db, "ops_shipments", "operation_id")) db.exec(MIGRATION_NNN_COLUMN_SQL); INSERT INTO schema_migrations (NNN, now) })(); }`. Comentario: «Se comprueba el número NNN, no el máximo». |
| `src/lib/ops/alert-config.ts` | Agregar `ATRASO_MIN_DEFAULT = 30` y `atrasoMinDefault()` con `minutesFromEnv("OPS_ALERTA_ATRASO_MIN", 30)`. Agregar los defaults y lectores de §6. Agregar `countFromEnv(name, fallback, max)` para `OPS_ALERTA_DESVIO_PUNTOS` y `OPS_ALERTA_SIN_CONTACTO_INTENTOS` (enteros de 1 a 20). Agregar `percentFromEnv` para `OPS_ALERTA_DIFERENCIA_COSTO_PCT`, sin default (regla inactiva). Actualizar el comentario «El atraso sigue fijo en 30 minutos». |
| `src/lib/ops/alerts.ts` | Solo `defaultMinutes()`: `atraso: atrasoMinDefault()` en vez de `30`. No cambian `ALERT_KINDS`, `KIND_SEVERITY` ni las escrituras en `ops_alerts`. |
| `src/lib/ops/operation-alerts.ts` | **Nuevo.** `OPERATION_ALERT_KINDS` (los 16), `OPERATION_KIND_SEVERITY` (tabla de §7), `openOrRefresh()` (respeta el índice único; si sigue abierta, solo actualiza `evidence_json` y `updated_at`), `closeAlert(id, reason, actor)`, `evaluateOperationAlerts(now)` (P1: `retiro_no_iniciado`, `espera_destino`, `desvio_geocerca`, `evidencia_faltante`, `sin_asignar`, `documento_vencido`), `registerManualIncident(user, shipmentId, body)` (zod; solo los kinds manuales), `listOperationAlerts(user, {shipmentId? , operationId?})` (permiso `canReadShipment`) y `redactPersonal(evidence)` (quita RUT, teléfono y correo con regex y guarda `"[dato personal omitido]"`). Al abrir, completa `operation_id` desde `ops_shipments.operation_id`. |
| `src/lib/ops/shipments.ts` | Mapear `operation_id` → `operationId` en el tipo y en `SHIPMENT_SELECT`. Nueva `linkShipmentToOperation(user, shipmentId, operationId)`: valida el formato `^360-\d{4}-\d{4}$` y que exista en `ops_operations`; queda auditada como `ops.envio_operacion` y con evento `envio.operacion_vinculada`. |
| `src/lib/audit.ts` | Etiquetas `ops.incidencia_abierta`, `ops.incidencia_cerrada` y `ops.envio_operacion`. |
| `src/lib/ops/flags.ts` | Agregar `OPS_INCIDENCIAS_ENABLED` a `OPS_FLAGS` y a `OPS_CHILD_FLAGS`. Como hijo, solo vale con el maestro encendido. |
| `src/app/api/ops/alertas/evaluar/route.ts` | **Nuevo.** `POST`, `opsGuard(handler, "OPS_INCIDENCIAS_ENABLED")`, `assertAlertJob(headers)` (reutiliza `OPS_ALERTAS_JOB_SECRET`) → `evaluateOperationAlerts()`. Devuelve `{reviewed, opened, closed}`. |
| `src/app/api/ops/envios/[id]/incidencias/route.ts` | **Nuevo.** `GET` lista, `POST` registro manual y `PATCH` cierre `{id, reason}`, con sesión y `opsGuard(..., "OPS_INCIDENCIAS_ENABLED")`. |
| `src/app/api/ops/envios/[id]/operacion/route.ts` | **Nuevo.** `PUT {operationId}` → `linkShipmentToOperation`, mismo guard. |
| `src/lib/ops/tracking.ts`, `src/app/seguimiento/[token]/page.tsx` | **Sin cambios.** Ver §8. |
| `.env.example` | Documentar, comentadas, las claves de §6. **No** tocar `OPS_ALERTAS_JOB_SECRET=` ni proponer un valor. |
| `scripts/smoke-ops-404.mjs` | Agregar las 3 rutas nuevas a la lista que debe dar 404 con el flag apagado. |

---

## 6. Variables de entorno

Todas comentadas en `.env.example`. Las de minutos usan `minutesFromEnv` (1 a 10.080; un valor inválido o ausente vuelve al default).

| Variable | Default | Usa | Estado |
|---|---|---|---|
| `OPS_ALERTA_ATRASO_MIN` | 30 | `atraso` (`ops_alerts`) | **Nueva** (decisión 3) |
| `OPS_ALERTA_DETENCION_MIN` | 20 | `detencion` | Ya existe (oficial) |
| `OPS_ALERTA_SIN_SENAL_MIN` | 45 | `sin_senal` | Ya existe (oficial) |
| `OPS_ALERTA_RETIRO_MIN` | 30 | `retiro_no_iniciado` | Nueva |
| `OPS_ALERTA_ESPERA_DESTINO_MIN` | 60 | `espera_destino` | Nueva |
| `OPS_ALERTA_DESVIO_MIN` | 15 | `desvio_geocerca` (minutos fuera) | Nueva |
| `OPS_ALERTA_DESVIO_PUNTOS` | 3 | `desvio_geocerca` (posiciones seguidas alejándose) | Nueva (conteo, 1 a 20) |
| `OPS_ALERTA_SIN_ASIGNAR_MIN` | 1440 | `sin_asignar` | Nueva |
| `OPS_ALERTA_EVIDENCIA_MIN` | 120 | `evidencia_faltante` | Nueva |
| `OPS_ALERTA_CIERRE_MIN` | 2880 | `cierre_pendiente` (PR posterior) | Nueva, sin uso en este PR |
| `OPS_ALERTA_TEMPERATURA_MIN` | 15 | `temperatura_fuera_rango` (P3) | Reservada, sin uso |
| `OPS_ALERTA_SIN_CONTACTO_INTENTOS` | 3 | `sin_contacto` (validación del registro manual) | Nueva (conteo) |
| `OPS_ALERTA_DIFERENCIA_COSTO_PCT` | — (sin valor) | `diferencia_costo` (P3; pagos fuera de alcance) | Reservada, sin uso |
| `OPS_INCIDENCIAS_ENABLED` | apagado | Flag hijo de las rutas nuevas | Nueva |
| `OPS_ALERTAS_JOB_SECRET` | — | `/senal` y `/evaluar` | Ya existe. **Bloqueo externo** (§12). Sin valor propuesto. |

Precedencia, igual que hoy: fila por envío en `ops_alert_rules` (solo para los 3 kinds de la torre) > variable de entorno > default del código.

---

## 7. Severidad fija por `kind` (`OPERATION_KIND_SEVERITY`)

| `alta` | `media` | `baja` |
|---|---|---|
| `desvio_geocerca`, `siniestro`, `rechazo_entrega`, `entrega_con_reparos`, `documento_vencido`, `documento_faltante`, `retiro_no_iniciado`, `cambio_no_verificado`, `sin_contacto`, `diferencia_costo`, `temperatura_fuera_rango`, `incidente_seguridad` | `espera_destino`, `sin_asignar`, `evidencia_faltante` | `cierre_pendiente` |

Se fija al insertar y no cambia después, igual que `KIND_SEVERITY` en `alerts.ts:19-23`. La urgencia de Nivel 3 (`siniestro`, `diferencia_costo`, `incidente_seguridad`) no va en la severidad: la maneja el agente, escalando solo a JEFE BASTIAN.

---

## 8. Garantía: el enlace público no lee esta tabla

- `src/lib/ops/tracking.ts` y `src/app/seguimiento/[token]/page.tsx` **no se modifican** ni importan `operation-alerts.ts`.
- Una prueba estática: el texto de ambos archivos no contiene `ops_operation_alerts`, `operation-alerts` ni ningún kind nuevo. Es la misma técnica de `tests/ops-torre.test.ts:343`.
- Una prueba dinámica, con incidencias abiertas: la respuesta de `GET /api/ops/seguimiento/{token}` tiene exactamente las claves `destination, etaAt, origin, position, stage, token, truckAware` (CPI-T01).

---

## 9. Pruebas a agregar

| Archivo | Prueba | Casos |
|---|---|---|
| `tests/migraciones.test.ts` | Agregar `ops_operation_alerts` a la lista de tablas (línea 55); 0 filas tras migrar; columna `ops_shipments.operation_id` presente; aplicar dos veces no falla; la copia SQL coincide con `MIGRATION_NNN_SQL`; la reversa contiene `DROP TABLE IF EXISTS ops_operation_alerts` y `DROP COLUMN operation_id`, y no toca `ops_alerts`; los `CHECK` de `kind`, `severity`, `status`, `close_reason` y el de coherencia abierta/cerrada rechazan valores fuera de lista | CPI-T04 |
| `tests/ops-incidencias.test.ts` (nuevo) | Evaluador P1 con reloj inyectado | CPI-01, CPI-02, CPI-06, CPI-08, CPI-09, CPI-12 (P/N/B) |
| ídem | Registro manual, con redacción de datos personales | CPI-03, CPI-04, CPI-05, CPI-11 (P/N/B) |
| ídem | Unicidad de la alerta abierta y cierre con `closed_at`, `closed_by` y `close_reason` | CPI-T03 |
| ídem | Rutas con el flag apagado → 404; sin secreto → 503; secreto incorrecto → 401 | CPI-T02, CPI-T08 |
| ídem | Vínculo operación → envío → alerta (`operation_id` en la alerta; NULL si no hay vínculo) | CPI-T07 |
| `tests/ops-torre.test.ts` | `OPS_ALERTA_ATRASO_MIN`: default 30, override, valor inválido y precedencia de la fila por envío | CPI-T06 |
| `tests/ops-torre.test.ts` | El enlace público no lee la tabla nueva | CPI-T01 |
| (PR posterior) | `documento_faltante`, `cierre_pendiente` y P3 | CPI-07, CPI-13, CPI-10, CPI-14, CPI-15, CPI-16 |

Datos: usar `fixtures_incidencias_EJEMPLO.json` (operaciones `360-2611-99NN`, todas EJEMPLO).

---

## 10. Criterios de aceptación

1. CI en verde (`npm test` y el smoke de 404), sin cambios en las pruebas existentes de la torre, salvo las agregadas.
2. En una base vacía y en una copia con 022–032: queda `schema_migrations` con NNN, la tabla vacía y `ops_shipments.operation_id` en NULL para todas las filas.
3. Con `OPS_FEATURE_ENABLED` u `OPS_INCIDENCIAS_ENABLED` distinto de `"true"`, las 3 rutas nuevas responden 404 y no escriben nada.
4. Sin `OPS_ALERTAS_JOB_SECRET` configurado, `/evaluar` responde 503, igual que `/senal`.
5. `ops_alerts` no recibe filas de los kinds nuevos y `ops_operation_alerts` no recibe `atraso`, `detencion` ni `sin_senal` en este PR.
6. Toda apertura y todo cierre dejan auditoría y evento en `ops_events`.
7. El enlace público no cambia de forma (§8).
8. Con `OPS_ALERTA_ATRASO_MIN` sin definir, el comportamiento de `atraso` queda idéntico al actual.
9. La reversa, en una copia, deja el esquema igual al de la 032.

---

## 11. Plan de despliegue (detrás de `OPS_FEATURE_ENABLED`)

1. PR contra `release/2026-11-15` con CI; revisión y merge por G · JEFE BASTIAN.
2. Kit de despliegue con el mismo esquema que `out/deploy-*` (fase A respaldo y build, fase B cambio, fase C verificación, `ROLLBACK.sh`). El respaldo de la base es obligatorio antes de arrancar con la migración ops_operation_alerts.
3. La migración se aplica sola al arrancar, sin importar el flag (así son las 029–032). Verificar:
   - `SELECT version FROM schema_migrations WHERE version = NNN`;
   - la tabla vacía;
   - las 3 rutas nuevas en 404 con el flag hijo apagado.
4. Encender `OPS_INCIDENCIAS_ENABLED=true` **solo en QA o staging**, con datos EJEMPLO, y correr CPI-01 a CPI-T08.
5. Encenderlo en producción solo con el OK expreso de Gerencia y después de levantar el bloqueo de §12.
6. El timer systemd (lo instala DevOps) invoca `/api/ops/alertas/senal` y `/api/ops/alertas/evaluar` cada 5 minutos.

---

## 12. Rollback

- **Código:** revertir el merge del PR. Las rutas nuevas desaparecen; con el flag apagado ya responden 404.
- **Esquema** (solo si hace falta): respaldo → `docs/migrations/NNN-ops-operation-alerts-rollback.sql` → reiniciar. Se pierden las incidencias y los vínculos envío → operación registrados.
- Revertir el código sin correr la reversa es seguro: la tabla y la columna quedan sin uso.

---

## 13. Bloqueos externos

| Bloqueo | Efecto | Quién lo levanta |
|---|---|---|
| **`OPS_ALERTAS_JOB_SECRET` sin definir** | `/senal` y `/evaluar` responden 503. El timer systemd de DevOps (cada 5 min en el VPS) **queda BLOQUEADO**. No se crea, sugiere ni documenta ningún valor. | Gerencia |
| Timer systemd | Sin el timer, `sin_senal` y las P1 automáticas solo se evalúan cuando alguien consulta. | DevOps, después de lo anterior |
| Encendido en producción | Requiere un OK expreso. | Gerencia |

---

*Fin. Carga360go.*
