# Catálogo de incidencias y alertas — Carga360go

**Documento:** base de reglas para los agentes C360-TRACK y C360-GUARDIAN
**Estado:** **VERSIÓN FINAL** (versión única, actualizada con las decisiones de JEFE BASTIAN del 17-11-2026) · 17-11-2026 (hora de Chile, UTC-3) · solo documento. No modifica código, bases de datos ni producción.
**Encargo:** Gerencia, vía G · JEFE BASTIAN · Administrador web y automatizaciones
**Código de referencia:** `origin/release/2026-11-15` en `f5b5893` (fetch a las 08:27, hora de Chile). La validación del PR #55 se hizo en `dacb93e`; los merges posteriores (#56 a #59) no tocan `alerts.ts`, `alert-config.ts`, `tracking.ts` ni la 029/031. Worktree de solo lectura: `/workspace/c360/tmp/wt-val-dacb93e` (hoy en `f5b5893`).
**Archivos relacionados (misma carpeta):** `ESPEC_PR_ops_operation_alerts.md` (especificación del PR), `CASOS_PRUEBA_INCIDENCIAS.md` (56 casos), `fixtures_incidencias_EJEMPLO.json`, `CORRECCION_PLAN_QA_UMBRALES.md` y `.patch`

> **Convenciones.** **[CÓDIGO]** = existe en el código citado, con archivo y línea. **PROPUESTA** = no existe y requiere un PR aparte. Los umbrales son **valores sugeridos y parametrizables**, no mediciones reales. Los ejemplos están marcados **EJEMPLO** y usan datos ficticios.

---

## 0. Validación contra código — 17-11-2026

**Base:** `git fetch --all --prune` en `/workspace/c360/repo` a las 08:18 (hora de Chile). Lectura con `git log` / `git show` / `git diff` y un worktree desacoplado en `/workspace/c360/tmp`. Sin push, sin cambio de rama y sin tocar producción.

| Dato | Valor |
|---|---|
| Commit que implementa los cambios | `facd763b40ac58015fda8164eb39f5d6a593b108` («Oculta las alertas internas del seguimiento público.», 17-11-2026 08:01 hora de Chile) |
| Rama de origen | `origin/feat/seguimiento-hallazgos` |
| Merge | **PR #55**, commit `be067cb97306d0e153fb9adb52eb8a188025db44` (17-11-2026 08:05 hora de Chile) en `release/2026-11-15` |
| Punta de la release revisada | `dacb93e` (merge del PR #56, que no toca seguimiento) |
| Flag | `OPS_FEATURE_ENABLED` (maestro; solo el texto exacto `"true"` lo enciende; `src/lib/ops/flags.ts`). La ruta del evaluador lo exige mediante `opsGuard` (`src/lib/ops/http.ts:10-21`). **No hay un flag hijo propio para la torre.** |
| Producción | **Informado por JEFE BASTIAN, 08:16:** `be067cb` está en producción, con las migraciones 22 a 31 aplicadas y `ops_alerts.severity` presente. **No verificado por este agente** (no se consultó producción). En el box existe el kit `/workspace/c360/out/deploy-20261117-0810/` con `release-be067cb.tar.gz`. |

### 0.1 Resultado de la validación de los 4 cambios anunciados

| # | Cambio anunciado | Resultado | Evidencia en `dacb93e` |
|---|---|---|---|
| 1 | Enlace público sin alertas | **CONFIRMADO** | `src/lib/ops/tracking.ts`: se quitó `alerts` de `TrackingView`, ya no lee `ops_alerts` y ya no llama a `reviewAlerts` (línea 111: «No lee ni devuelve ops_alerts»). `src/app/seguimiento/[token]/page.tsx`: se eliminó `ALERT_LABEL` y la lista. Prueba: `tests/ops-torre.test.ts:343`. |
| 2 | Evaluador de señal (`sin_senal`) | **CONFIRMADO, con alcance limitado** | `POST /api/ops/alertas/senal` (`src/app/api/ops/alertas/senal/route.ts`) → `evaluateSilentSignals()` (`src/lib/ops/alerts.ts:200`). Autorización `Authorization: Bearer <OPS_ALERTAS_JOB_SECRET>` de 24 caracteres o más (`src/lib/ops/alert-job.ts`): sin secreto 503, secreto incorrecto 401, flag apagado 404. **No hay cron**: alguien tiene que programar la llamada. Solo cubre `sin_senal`; no evalúa `detencion` ni `atraso`. Prueba: `tests/ops-torre.test.ts:410`. |
| 3 | Umbrales en la configuración | **CONFIRMADO, parcial** | `src/lib/ops/alert-config.ts`: `OPS_ALERTA_DETENCION_MIN` (por defecto 20) y `OPS_ALERTA_SIN_SENAL_MIN` (por defecto 45). Se aceptan enteros entre 1 y 10.080; un valor inválido vuelve al default. **`atraso` sigue fijo en 30** (sin clave). Una fila de `ops_alert_rules` por envío pisa el default. En `.env.example` (líneas 189-199) las claves están comentadas: el código **no adopta** el 30/20 del QA. |
| 4 | Campo `severity` (baja/media/alta) | **CONFIRMADO** | Migración 031: `docs/migrations/031-ops-alertas-severity.sql` y `src/lib/db.ts:753` (se aplica en la línea 1332 de `f5b5893`): `ALTER TABLE ops_alerts ADD COLUMN severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('baja','media','alta'))`. Reversa: `031-ops-alertas-severity-rollback.sql`. Valores en código: `ALERT_SEVERITIES` (`alerts.ts:15`). Severidad **fija por tipo** (`KIND_SEVERITY`, `alerts.ts:19-23`): `atraso=media`, `detencion=alta`, `sin_senal=alta`. Solo se fija al insertar (`alerts.ts:156`); no sube ni baja después. |

**Lo que NO cambió (sigue abierto):**
- `kind` sigue limitado a `('atraso','detencion','sin_senal')` en `ops_alert_rules` y `ops_alerts` (`src/lib/db.ts:682` y `:693`); el comentario de la 031 dice «No cambia los kinds».
- **No existe una tabla nueva** de incidencias (ni `ops_operation_alerts` ni `ops_exceptions`). `ops_alert_rules` **no** tiene `severity`.
- `ops_geofences` no cambió.
- Al cerrar una alerta sigue sin haber auditoría, evento ni `closed_at` (`alerts.ts:146`).

**Efecto en este catálogo:** la escala de severidad pasa a ser exactamente la del código (`baja`/`media`/`alta`); se elimina `critica` (criterio en §3.1). `atraso` queda en `media` y `detencion` en `alta`, como en el código. Quedan resueltas o resueltas en parte las desalineaciones de la versión anterior sobre severidad, umbrales (parcial), evaluador sin cron (parcial) y alertas visibles en el enlace público (§8.1). Se actualizan rutas y líneas a `dacb93e`.

---

### 0.2 Decisiones de JEFE BASTIAN (17-11-2026) — RESUELTAS

Son decisiones de JEFE BASTIAN; los hechos que informa se marcan como «informado» y no se verificaron en producción.

| # | Decisión | Estado en este catálogo |
|---|---|---|
| 1 | `be067cb` en producción desde las 08:16, con las migraciones 22 a 31 y `ops_alerts.severity` | ✅ **Registrado como «informado por JEFE BASTIAN 08:16»**; no verificado (§0) |
| 2 | `ops_operation_alerts` va en la siguiente migración libre: aditiva, con rollback, aprobada como propuesta para PR | ✅ **Migración ops_operation_alerts**, identificada por su nombre. El número (`NNN`) lo asigna Cursor al abrir el PR; tras el fetch de las 08:27, la release `f5b5893` llega a 032 (`ai_router_usage`, PR #59). Especificación: `ESPEC_PR_ops_operation_alerts.md` |
| 3 | Umbrales oficiales = los del código: `detencion` 20, `sin_senal` 45 y `atraso` 30, todos configurables por variable | ✅ Adoptados. Se propone `OPS_ALERTA_ATRASO_MIN` (default 30) en la migración ops_operation_alerts. El plan de QA se corrige en `CORRECCION_PLAN_QA_UMBRALES.md` (+ `.patch`) |
| 4 | El evaluador `sin_senal` lo programa DevOps con un timer systemd cada 5 min en el VPS | ✅ Documentado. **BLOQUEO EXTERNO:** queda detenido hasta que Gerencia defina `OPS_ALERTAS_JOB_SECRET` (sin secreto, la ruta responde 503). No se crea ni se propone ningún valor |
| 5 | Vínculo: operación `360-YYMM-NNNN` → envíos (`operation_id`) → transportista según la asignación vigente, con el modelo de la 030 y sin tablas nuevas | ✅ Modelo adoptado. Verificado en `f5b5893`: `ops_operations.id` existe (030, `operacion.ts:83`), **`ops_shipments.operation_id` NO existe**. La migración ops_operation_alerts la agrega como columna nullable con índice (no es una tabla nueva). Transportista: `ops_shipments.assigned_offer_id` → `offers.carrier_id` → `transportistas.user_id` → `documentos_acreditacion` |

---

## 1. Tabla resumen

### 1.1 Alertas que ya existen [CÓDIGO]

| Código (`kind`) | Incidencia | Etapa | Severidad (código) | Umbral por defecto / clave | Disparador | Avisa a | Escala en | Aprobación para actuar |
|---|---|---|---|---|---|---|---|---|
| `atraso` | Atraso de ETA | en ruta | `media` | 30 min (oficial); hoy fijo, `OPS_ALERTA_ATRASO_MIN` propuesta en la migración ops_operation_alerts; por envío en `ops_alert_rules` | Recálculo de ETA (`eta.ts:386`, `:403`) o `GET .../alertas` | Coordinador de operaciones | 30 min → Jefatura | Sí, para enviar A8 |
| `detencion` | Detención prolongada | en ruta | `alta` | 20 min · `OPS_ALERTA_DETENCION_MIN` | Recálculo de ETA o `GET .../alertas` | Coordinador | 30 min → Jefatura | Sí, para contactar (B3) |
| `sin_senal` | Pérdida de GPS | en ruta | `alta` | 45 min · `OPS_ALERTA_SIN_SENAL_MIN` | `POST /api/ops/alertas/senal` (timer systemd cada 5 min, **bloqueado** por el secreto), recálculo de ETA o `GET .../alertas` | Coordinador | 30 min → Jefatura | Sí, para contactar (B3) |

### 1.2 Incidencias PROPUESTA (16)

| # | Código (`kind`) | Incidencia | Etapa | Severidad | Avisa a (interno) | Escala en | Aprobación / nivel | Prioridad | Agente |
|---|---|---|---|---|---|---|---|---|---|
| INC-01 | `desvio_geocerca` | Desvío o salida de geocerca | en ruta | `alta` | Coordinador | 15 min → Jefatura | Sí · 2b | P1 | C360-TRACK |
| INC-02 | `espera_destino` | Espera prolongada en destino sin entrega | en ruta / entregada | `media` | Coordinador (I: Ejecutivo) | 60 min → Jefatura | Sí · 2b | P1 | C360-TRACK |
| INC-03 | `siniestro` | Accidente, robo o siniestro | en ruta | `alta` | Jefatura + Coordinador | **Inmediato → JEFE BASTIAN** | Sí · **3** | P2 | C360-GUARDIAN |
| INC-04 | `rechazo_entrega` | Rechazo de la carga | entregada | `alta` | Coordinador + Ejecutivo | 30 min → Jefatura | Sí · 2b (3 si hay monto) | P2 | C360-TRACK |
| INC-05 | `entrega_con_reparos` | Entrega con daño o faltante | entregada | `alta` | Coordinador + Jefatura | 2 h → Jefatura | Sí · 2b (3 si hay monto) | P2 | C360-GUARDIAN |
| INC-06 | `documento_vencido` | Documento vencido a la fecha del viaje | asignada | `alta` | Coordinador | 2 h → Jefatura | Sí · no asignar | P1 | C360-GUARDIAN |
| INC-07 | `documento_faltante` | Documento faltante o no aprobado | asignada | `alta` | Coordinador | 2 h → Jefatura | Sí · no asignar | P2 | C360-GUARDIAN |
| INC-08 | `sin_asignar` | Operación sin asignar a tiempo | validada / asignada | `media` | Coordinador + Ejecutivo | 1 h → Jefatura | Sí | P1 | C360-TRACK |
| INC-09 | `retiro_no_iniciado` | Retiro no iniciado | asignada → en ruta | `alta` | Coordinador | 30 min → Jefatura | Sí · 2b | P1 | C360-TRACK |
| INC-10 | `cambio_no_verificado` | Cambio de conductor o vehículo sin verificar | asignada / en ruta | `alta` | Coordinador | 1 h → Jefatura | Sí | P3 | C360-GUARDIAN |
| INC-11 | `sin_contacto` | Sin contacto con el transportista | en ruta | `alta` | Coordinador → Jefatura | Plazo de P-05 → Jefatura (inmediato si hay `sin_senal`) | Sí · 2b | P2 | C360-TRACK |
| INC-12 | `evidencia_faltante` | POD faltante o incompleto | entregada | `media` | Coordinador | 24 h → Jefatura | Sí · 2b | P1 | C360-GUARDIAN |
| INC-13 | `cierre_pendiente` | Cierre fuera de plazo | entregada → cerrada | `baja` | Coordinador + Administración | 48 h → Jefatura | Sí | P2 | C360-GUARDIAN |
| INC-14 | `diferencia_costo` | Diferencia de costo real vs estimado | cerrada | `alta` | Administración y control de costos | **Inmediato → JEFE BASTIAN** | Sí · **3** | P3 | C360-GUARDIAN |
| INC-15 | `temperatura_fuera_rango` | Temperatura fuera de rango (si aplica) | en ruta | `alta` | Coordinador + Jefatura | 15 min → Jefatura | Sí | P3 | C360-TRACK |
| INC-16 | `incidente_seguridad` | Exposición de datos o del enlace | cualquiera | `alta` | **Solo JEFE BASTIAN** | **Inmediato** | Sí · **3** | P3 | C360-GUARDIAN |

**Total: 19 incidencias** (3 existentes y 16 PROPUESTA). Los casos de prueba de las 16 propuestas están en `CASOS_PRUEBA_INCIDENCIAS.md`, con IDs `CPI-01` a `CPI-16` que coinciden con `INC-01` a `INC-16`.

---

## 2. Lo que existe hoy en el código (`dacb93e`)

Búsqueda: `rg -n 'ops_alert_rules|ops_alerts|ops_geofences'` en `/workspace/c360` (sin `node_modules`), incluidos los worktrees `wt-*`, `src`, `carga360go-gh` y `mergetest`. **Las tres tablas existen solo en el repo** (`/workspace/c360/repo`, release); los demás directorios no las tienen. No hay seeds: la migración no inserta filas, y las pruebas de `tests/migraciones.test.ts` exigen 0 filas.

### 2.1 Archivos de origen

| Dato | Archivo exacto |
|---|---|
| DDL de las tablas (029) | `docs/migrations/029-ops-torre.sql`; en ejecución, `src/lib/db.ts` (`MIGRATION_29_SQL`, línea 643: `ops_geofences` 644, `ops_alert_rules` 679, `ops_alerts` 690, `ops_tracking_links` 702) |
| `severity` (031) | `docs/migrations/031-ops-alertas-severity.sql`, reversa `031-ops-alertas-severity-rollback.sql`, `src/lib/db.ts:753` y `:1332` (`f5b5893`) |
| Tipos, severidad y lógica de alertas | `src/lib/ops/alerts.ts` (`ALERT_KINDS` 12, `ALERT_SEVERITIES` 15, `KIND_SEVERITY` 19-23, `STOP_RADIUS_M` 25, `defaultMinutes` 27, `thresholds` 114, `setAlert` 137-159, `reviewSilent` 180, `evaluateSilentSignals` 200, `reviewAlerts` 229, `listAlerts` 268, `saveThresholds` 305) |
| Umbrales por configuración | `src/lib/ops/alert-config.ts`; ejemplo comentado en `.env.example` (líneas 189-199) |
| Evaluador de `sin_senal` | `src/app/api/ops/alertas/senal/route.ts` y `src/lib/ops/alert-job.ts` |
| Flag | `src/lib/ops/flags.ts` (`OPS_FEATURE_ENABLED`) y `src/lib/ops/http.ts:10-21` (`opsGuard`) |
| Geocercas | `src/lib/ops/eta.ts` (esquema 20-25, `evaluatePosition` 191, `reviewAlerts` en 386 y 403) y `src/lib/ops/eta-types.ts` |
| API de alertas y de geocercas | `src/app/api/ops/envios/[id]/alertas/route.ts`, `src/app/api/ops/envios/[id]/geocercas/route.ts` |
| Enlace público (sin alertas) | `src/lib/ops/tracking.ts:111-112`, `src/app/seguimiento/[token]/page.tsx` |
| Auditoría | `src/lib/audit.ts:83-84` (`ops.alerta_abierta`, `ops.alerta_umbral`) |
| Etapas del envío | `docs/migrations/023-ops-envios.sql`, `src/lib/ops/shipments.ts:8-18` |
| Operación `360-YYMM-NNNN` (030, PR #52, fusionada) | `docs/migrations/030-ops-operacion.sql`, `src/lib/db.ts:717` (`ops_operations`) |
| Documentos y avisos de vencimiento | `docs/migrations/017-bassam-tablas.sql:35-46` (`documentos_acreditacion`); `src/lib/bassam/acreditacion.ts:479` (`runExpiryAlerts`: 30, 15 y 7 días, escribe en `admin_bassam_360`) |
| GPS / POD | `src/lib/bassam/ops.ts:16` (`trip_gps_points`); `src/lib/pagos/schema.ts:139` (`pod_evidence`) |
| Pruebas existentes | `tests/ops-torre.test.ts` (67, 89, 343, 410), `tests/migraciones.test.ts:577`, `tests/bassam-tablas.test.ts:156` |

### 2.2 `ops_alert_rules` [CÓDIGO] — sin cambios en el PR #55

`id` TEXT PK · `shipment_id` TEXT NOT NULL → `ops_shipments(id)` ON DELETE CASCADE · `kind` CHECK `('atraso','detencion','sin_senal')` · `threshold_min` INTEGER > 0 (la API acepta hasta 10.080) · `created_at`, `updated_at` TEXT (ISO UTC) · `UNIQUE (shipment_id, kind)`.
- Guarda umbrales **por envío**. No tiene severidad, destinatario, escalamiento ni acción. Sin filas sembradas.
- Orden de precedencia del umbral: fila en `ops_alert_rules` > variable de entorno (`OPS_ALERTA_DETENCION_MIN`, `OPS_ALERTA_SIN_SENAL_MIN`) > default del código (20 / 45). `atraso`: fila > 30 fijo.
- Se escribe con `PUT /api/ops/envios/{id}/alertas` `{ atrasoMin?, detencionMin?, sinSenalMin? }` y queda auditado como `ops.alerta_umbral`.

### 2.3 `ops_alerts` [CÓDIGO] — con `severity` desde la 031

`id` TEXT PK · `shipment_id` TEXT NOT NULL → `ops_shipments(id)` · `kind` CHECK `('atraso','detencion','sin_senal')` · `status` CHECK `('abierta','cerrada')` · **`severity` TEXT NOT NULL DEFAULT `'media'` CHECK `('baja','media','alta')`** · `evidence_json` TEXT NOT NULL · `opened_at`, `updated_at` TEXT · índice único parcial `idx_ops_alerts_open (shipment_id, kind) WHERE status='abierta'`.
- Una alerta abierta por envío y tipo. Si la condición sigue, solo se actualiza la evidencia; si desaparece, la alerta se cierra sola.
- Al abrir queda auditada como `ops.alerta_abierta`, con el evento `alerta.abierta` en `ops_events`. **Al cerrar no hay rastro.**
- Las filas anteriores a la 031 quedan en `media`.

### 2.4 `ops_geofences` [CÓDIGO] — sin cambios

`id` · `shipment_id` · `point` CHECK `('origen','destino')` · `lat`, `lng` REAL (la API restringe a Chile) · `radius_m` REAL > 0 (la API acepta hasta 50.000) · `UNIQUE (shipment_id, point)`. Un círculo por punto; el borde cuenta como dentro (`distanceM <= radiusM`). No hay corredor ni eventos de ingreso o salida.

### 2.5 Detección actual de las 3 alertas [CÓDIGO]

| `kind` | Condición | Evidencia (`evidence_json`) | Quién la evalúa |
|---|---|---|---|
| `atraso` | `eta_at > planned_delivery_at + umbral` (`alerts.ts:253`) | `{etaAt, plannedDeliveryAt, umbralMin, gpsPointId, truckAware:false}` | Recálculo de ETA / `GET .../alertas` |
| `detencion` | Dos últimas posiciones: ≤ 200 m, ≥ umbral y fuera de la geocerca de destino (`alerts.ts:240`) | `{gpsPointId, distanciaM, minutos, umbralMin, radioM}` | Recálculo de ETA / `GET .../alertas` |
| `sin_senal` | `ahora − última recorded_at ≥ umbral` (`reviewSilent`, `alerts.ts:180`) | `{gpsPointId, recordedAt, minutos, umbralMin}` | **`POST /api/ops/alertas/senal`**, recálculo de ETA / `GET .../alertas` |

El enlace público **ya no dispara la revisión** de alertas, a diferencia de lo que pasaba antes del PR #55.

---

## 3. Escalas y convenciones

### 3.1 Severidad [CÓDIGO]: `baja` / `media` / `alta`

Es la escala exacta de `ALERT_SEVERITIES` y del `CHECK` de la migración 031. **No existe `critica`.**

| Severidad | Uso en este catálogo | Plazo sugerido para tomar la alerta |
|---|---|---|
| `alta` | Compromete a las personas, la carga, el plazo comprometido, los datos o el dinero. | ≤ 15 min (o inmediato si es Nivel 3) |
| `media` | Desviación que puede escalar si no se atiende. | ≤ 60 min |
| `baja` | Tarea administrativa atrasada sin impacto inmediato en la carga. | ≤ 1 día hábil |

**Criterio de remapeo (se eliminó `critica`).**
1. Todo lo que era `critica` (siniestro, temperatura e incidente de seguridad) pasa a `alta`, el tope de la escala.
2. La urgencia adicional ya no se expresa con la severidad, sino con dos campos que no dependen de ella:
   - el **nivel** (Nivel 3 → solo JEFE BASTIAN);
   - el **plazo de escalamiento** («inmediato»).
3. El código fija **una severidad por tipo** al insertar (`KIND_SEVERITY`) y no la cambia después. Por eso se eliminaron las reglas «sube a crítica/alta si supera 2× o 3× el umbral». Ese agravamiento ahora se trata como **escalamiento por tiempo** a Jefatura, no como un cambio de severidad.
4. Se adoptan las severidades del código para las 3 existentes: `atraso` baja de `alta` a **`media`** y `detencion` sube de `media` a **`alta`**.
5. `sin_asignar` queda en `media`: todavía hay margen antes del retiro, y el escalamiento de 1 h cubre la urgencia.

### 3.2 Niveles de acción

Niveles de `out/arquitectura/VALIDACION_DATOS.md` (línea 19), con la instrucción vigente de Gerencia:

| Nivel | Qué cubre | Regla |
|---|---|---|
| 1 | Detección y **registro de la alerta** | Automático, apenas ocurre, sin aprobación |
| 2a | Escritura propia del bot (bitácora, borrador) | Se hace y se revisa después |
| 2b | Afecta a terceros (aviso a cliente o transportista, reasignación) | El bot **solo propone** con plantilla; una persona aprueba y envía |
| 3 | Financiero, borrado o seguridad | **Solo se escala a JEFE BASTIAN**; el bot no ejecuta nada |

### 3.3 Códigos, destinatarios y contacto

- Código = valor de `kind`, en minúsculas y `snake_case`, igual que los existentes.
- Destinatarios = roles internos del procedimiento operativo (`/workspace/3_GROK_BOTS/1_procedimientos-operativos-carga360go.md`, §0 y RACI §4); Nivel 3 = JEFE BASTIAN.
- **El bot no contacta a clientes ni a transportistas.** Deja borradores con las plantillas A1–A9 (cliente) o B1–B4 (transportista) para el rol responsable.

### 3.4 Etapas

| Ciclo de Gerencia | `ops_shipments.stage` [CÓDIGO] | Procedimiento |
|---|---|---|
| solicitada | — (no existe en `ops_shipments`; `ops_operations.estado` solo admite `planificada`) | P-01 |
| validada | `negociacion` *(equivalencia supuesta)* | P-02 / P-03 |
| asignada | `asignacion` | P-04 |
| en ruta | `ejecucion` | P-05 |
| entregada | `pod` | P-06 |
| cerrada | `auditoria` → `facturacion` → `pago` → `cerrado` | P-07 |
| *(lateral)* | `cancelado` | — |

---

## 4. Fichas de las 3 alertas existentes [CÓDIGO]

### E-1 · `atraso` — Atraso de ETA
- **Etapa:** en ruta · P-05.
- **Detección:** ETA > `planned_delivery_at` + umbral (30 oficial; hoy fijo en el código, configurable con `OPS_ALERTA_ATRASO_MIN` tras la migración ops_operation_alerts; o por envío).
- **Severidad:** `media` (código).
- **Avisa a:** Coordinador (I: Ejecutivo). **Escala:** 30 min → Jefatura.
- **Acción:** confirmar la nueva hora con el transportista (por persona) y dejar el borrador **A8** para el Ejecutivo. El ETA usa perfil de auto (`truckAware:false`).
- **Aprobación:** sí, para A8 (2b).
- **Mapeo:** `ops_alert_rules.kind='atraso'`; `ops_alerts(kind='atraso', severity='media')`; `ops_geofences.point='destino'`.
- **Pruebas existentes:** QA TWR-07/08, `tests/ops-torre.test.ts:89`.

### E-2 · `detencion` — Detención prolongada
- **Etapa:** en ruta.
- **Detección:** dos últimas posiciones a ≤ 200 m y ≥ `OPS_ALERTA_DETENCION_MIN` (20), fuera del destino.
- **Severidad:** `alta` (código).
- **Avisa a:** Coordinador. **Escala:** 30 min → Jefatura; 15 min si también está abierta `sin_senal`.
- **Acción:** consultar al conductor (borrador B3) y registrar el motivo. Una detención dentro de la geocerca de origen no se excluye: revisarla como posible espera de carguío.
- **Aprobación:** sí (2b).
- **Mapeo:** `ops_alerts(kind='detencion', severity='alta')`.
- **Pruebas:** TWR-09, `tests/ops-torre.test.ts:410`.

### E-3 · `sin_senal` — Pérdida de GPS
- **Etapa:** en ruta.
- **Detección:** ahora − última posición ≥ `OPS_ALERTA_SIN_SENAL_MIN` (45).
- **Severidad:** `alta` (código).
- **Evaluador:** `POST /api/ops/alertas/senal` con `OPS_ALERTAS_JOB_SECRET`. DevOps lo programará con un timer systemd cada 5 min en el VPS (decisión 4). **BLOQUEO EXTERNO:** hasta que Gerencia defina el secreto, la ruta responde 503 y el timer no corre.
- **Avisa a:** Coordinador. **Escala:** 30 min → Jefatura; inmediato si también hay `sin_contacto`.
- **Acción:** confirmar la ubicación por teléfono (por persona, borrador B3) y revisar `ops_telematics_sources` / `ops_gps_receipts` para distinguir una falla del proveedor GPS de una del camión.
- **Aprobación:** sí (2b).
- **Mapeo:** `ops_alerts(kind='sin_senal', severity='alta')`.
- **Pruebas:** TWR-10/11, `tests/ops-torre.test.ts:410`.

---

## 5. Fichas de las 16 incidencias PROPUESTA

Formato de cada ficha: detección (fuente y condición), severidad, destinatario y escalamiento, acción, aprobación, mapeo y casos de prueba. Los plazos se cuentan desde `opened_at` si nadie tomó la alerta. Tabla destino propuesta para todas: `ops_operation_alerts` (ver §7).

### INC-01 · `desvio_geocerca` — Desvío o salida de geocerca
- **Etapa:** en ruta.
- **Detección:** con la evaluación `{point, inside, distanceM}` de `ops_geofences` sobre posiciones sucesivas:
  - (a) salida de origen sin evento de retiro;
  - (b) distancia al destino que crece en `OPS_ALERTA_DESVIO_PUNTOS` (3) posiciones seguidas;
  - (c) salida del destino sin POD.
  - El **desvío de ruta** propiamente tal no se puede detectar sin una geocerca de corredor.
- **Severidad:** `alta`. **Avisa a:** Coordinador. **Escala:** 15 min → Jefatura; si se sospecha robo → INC-03.
- **Acción:** confirmar con el conductor (borrador B3). Un cambio de destino exige instrucción escrita del cliente.
- **Aprobación:** sí (2b).
- **Mapeo:** lee `ops_geofences`, `trip_gps_points` y `ops_eta_snapshots.evaluacion_json`. **Casos:** CPI-01-P/N/B.

### INC-02 · `espera_destino` — Espera prolongada en destino
- **Etapa:** en ruta → entregada.
- **Detección:** dentro de `ops_geofences.point='destino'` ≥ `OPS_ALERTA_ESPERA_DESTINO_MIN` (60), sin `pod_evidence`. Cubre el hueco que deja `detencion`, que excluye el destino.
- **Severidad:** `media`. **Avisa a:** Coordinador (I: Ejecutivo). **Escala:** 60 min → Jefatura.
- **Acción:** verificar con el contacto de destino (por persona). No entregar a un receptor no autorizado. Registrar la espera para el costo real.
- **Aprobación:** sí (2b). **Casos:** CPI-02.

### INC-03 · `siniestro` — Accidente, robo o siniestro
- **Etapa:** en ruta.
- **Detección:** **registro manual** del Coordinador. Señales de apoyo (`detencion` + `sin_senal`, INC-01 c) solo sugieren una revisión; no abren el siniestro.
- **Severidad:** `alta`. **Avisa a:** Jefatura + Coordinador. **Escala:** **inmediato → JEFE BASTIAN** (Nivel 3, seguridad).
- **Acción:** primero las personas; las emergencias (133, 131, 132) las llama el transportista. El bot reúne la evidencia y deja borradores A8/B3 sin enviar. Nunca informa a la aseguradora.
- **Aprobación:** sí, siempre.
- **Mapeo:** `evidence_json` `{reportadoPor, horaReporte, ultimaPosicion, gpsPointId, descripcion}` **sin datos personales**. **Casos:** CPI-03.

### INC-04 · `rechazo_entrega` — Rechazo de la carga
- **Etapa:** entregada.
- **Detección:** registro manual o observación del POD con rechazo total. Un rechazo parcial va a INC-05.
- **Severidad:** `alta`. **Avisa a:** Coordinador + Ejecutivo. **Escala:** 30 min → Jefatura; con cobro por retorno o almacenaje → JEFE BASTIAN.
- **Acción:** no abandonar la carga; esperar la instrucción escrita del cliente.
- **Aprobación:** sí. **Casos:** CPI-04.

### INC-05 · `entrega_con_reparos` — Daño o faltante
- **Etapa:** entregada.
- **Detección:** observación «con reparos» en `pod_evidence` o reporte manual.
- **Severidad:** `alta`. **Avisa a:** Coordinador + Jefatura. **Escala:** 2 h → Jefatura; reclamo con monto → **JEFE BASTIAN** (Nivel 3).
- **Acción:** fotos y constancia escrita; cerrar después como «Cerrado con incidencia pendiente». El bot no calcula ni ofrece montos.
- **Aprobación:** sí. **Casos:** CPI-05.

### INC-06 · `documento_vencido` — Documento vencido a la fecha del viaje
- **Etapa:** asignada.
- **Detección:** `documentos_acreditacion.vencimiento` < fecha de retiro, o `estado_admin IN ('rechazado','renovacion')`, en el transportista del envío.
- **Lo que ya existe:** los avisos previos de 30, 15 y 7 días ya existen en `runExpiryAlerts` (`admin_bassam_360`), así que esta regla **no los duplica**: solo cubre el vencimiento frente a la fecha del viaje.
- **Severidad:** `alta`. **Avisa a:** Coordinador. **Escala:** 2 h → Jefatura.
- **Acción:** **no asignar**. El bot no cambia `estado_admin`.
- **Aprobación:** sí.
- **Vínculo (decisión 5):** `ops_shipments.assigned_offer_id` → `offers.carrier_id` → `transportistas.user_id` → `documentos_acreditacion.transportista_id`. Todo existe hoy; falta solo `ops_shipments.operation_id` (migración ops_operation_alerts) para llegar desde la operación. **Casos:** CPI-06.

### INC-07 · `documento_faltante` — Documento faltante o no aprobado
- **Etapa:** asignada.
- **Detección:** falta un tipo obligatorio de la lista 2.1, o está en `estado_admin='pendiente_ok'`.
- **Severidad:** `alta`. **Avisa a:** Coordinador. **Escala:** 2 h → Jefatura.
- **Acción:** no asignar y dejar la lista de faltantes.
- **Aprobación:** sí. **Casos:** CPI-07 (complementa QA ASG-08 y DES-06).

### INC-08 · `sin_asignar` — Operación sin asignar a tiempo
- **Etapa:** validada / asignada.
- **Detección:** `stage='asignacion'`, sin `assigned_offer_id` y con `planned_pickup_at − ahora ≤ OPS_ALERTA_SIN_ASIGNAR_MIN` (1440).
- **Severidad:** `media`. **Avisa a:** Coordinador + Ejecutivo. **Escala:** 1 h → Jefatura.
- **Acción:** revisar candidatos; si no hay, dejar el borrador A8 con una nueva fecha.
- **Aprobación:** sí. **Casos:** CPI-08.

### INC-09 · `retiro_no_iniciado` — Retiro no iniciado
- **Etapa:** asignada → en ruta.
- **Detección:** `ahora ≥ planned_pickup_at + OPS_ALERTA_RETIRO_MIN` (30), sin posición dentro de `ops_geofences.point='origen'`.
- **Severidad:** `alta`. **Avisa a:** Coordinador. **Escala:** 30 min → Jefatura.
- **Acción:** confirmar la llegada a origen; si el transportista desiste, reasignar.
- **Aprobación:** sí. **Casos:** CPI-09.

### INC-10 · `cambio_no_verificado` — Cambio de conductor o vehículo
- **Etapa:** asignada / en ruta.
- **Detección:** la patente o el conductor informados no coinciden con los asignados y no se repitió la lista 2.2. **No hay columna de origen hoy.**
- **Severidad:** `alta`. **Avisa a:** Coordinador. **Escala:** 1 h → Jefatura.
- **Acción:** repetir la lista 2.2 y dejar un nuevo borrador A4.
- **Aprobación:** sí. **Casos:** CPI-10.

### INC-11 · `sin_contacto` — Sin contacto con el transportista
- **Etapa:** en ruta.
- **Detección:** registro manual de `OPS_ALERTA_SIN_CONTACTO_INTENTOS` (3) intentos sin respuesta.
- **Severidad:** `alta`. **Avisa a:** Coordinador → Jefatura. **Escala:** plazo `{por definir}` de P-05; inmediato si está abierta `sin_senal`.
- **Acción:** escalar y evaluar INC-03.
- **Aprobación:** sí. **Casos:** CPI-11.

### INC-12 · `evidencia_faltante` — POD faltante o incompleto
- **Etapa:** entregada.
- **Detección:** etapa `pod` ≥ `OPS_ALERTA_EVIDENCIA_MIN` (120), sin `pod_evidence` o sin un campo obligatorio (fotos, nombre y RUT del receptor, firma, fecha y hora).
- **Severidad:** `media`. **Avisa a:** Coordinador. **Escala:** 24 h → Jefatura.
- **Acción:** pedir que se complete (borrador B3); no cerrar.
- **Aprobación:** sí. **Casos:** CPI-12.

### INC-13 · `cierre_pendiente` — Cierre fuera de plazo
- **Etapa:** entregada → cerrada.
- **Detección:** etapa `pod` o `auditoria` ≥ `OPS_ALERTA_CIERRE_MIN` (2880).
- **Severidad:** `baja`. **Avisa a:** Coordinador + Administración. **Escala:** 48 h → Jefatura.
- **Acción:** listar lo que falta del expediente.
- **Aprobación:** sí, para cerrar. **Casos:** CPI-13.

### INC-14 · `diferencia_costo` — Diferencia de costo
- **Etapa:** cerrada.
- **Detección:** `|real − estimado| / estimado > OPS_ALERTA_DIFERENCIA_COSTO_PCT` (sin valor; punto abierto 3 de P-07).
- **Severidad:** `alta`. **Avisa a:** Administración. **Escala:** **inmediato → JEFE BASTIAN** (Nivel 3, financiera).
- **Acción:** adjuntar el desglose. El bot no toca montos, tarifas ni pagos. **Pagos están fuera de alcance**: solo se registra y se escala.
- **Casos:** CPI-14.

### INC-15 · `temperatura_fuera_rango` — Carga refrigerada o sensible
- **Etapa:** en ruta.
- **Detección:** lectura fuera de rango ≥ `OPS_ALERTA_TEMPERATURA_MIN` (15). **No hay fuente de datos**, así que queda inactiva hasta que exista un sensor o un proveedor.
- **Severidad:** `alta`. **Avisa a:** Coordinador + Jefatura. **Escala:** 15 min → Jefatura.
- **Aprobación:** sí. **Casos:** CPI-15.

### INC-16 · `incidente_seguridad` — Datos personales o enlace expuestos
- **Etapa:** cualquiera.
- **Detección:** datos personales del conductor o del receptor en `evidence_json`, o claves no permitidas en la respuesta del enlace público (lista permitida fijada por `tests/ops-torre.test.ts:343`).
- **Severidad:** `alta`. **Avisa a:** **solo JEFE BASTIAN**. **Escala:** inmediato (Nivel 3, seguridad).
- **Acción:** documentar. El bot no revoca tokens, no borra filas ni cambia permisos; las claves están fuera de alcance.
- **Casos:** CPI-16.

---

## 6. Priorización y especificación lista para implementar (16 PROPUESTA)

**Criterio.**
- **Impacto:** riesgo para las personas, la carga o el plazo, y frecuencia esperada.
- **Esfuerzo:** si los datos ya existen en tablas actuales (bajo), si se necesita registro manual o un vínculo nuevo (medio), o si falta la fuente de datos o el tema está fuera de alcance (alto).
- **Prioridades:**
  - **P1** = alto impacto con datos que ya existen;
  - **P2** = alto impacto, pero necesita registro manual o un vínculo nuevo;
  - **P3** = sin fuente de datos, fuera de alcance (pagos, claves) o riesgo ya mitigado en parte.

**Base común (prerrequisito de todas; PR de la migración ops_operation_alerts, aprobado como propuesta; detalle completo en `ESPEC_PR_ops_operation_alerts.md`):**
1. **Migración ops_operation_alerts** `NNN-ops-operation-alerts.sql` + reversa (NNN lo asigna Cursor al abrir el PR; 030, 031 y 032 ya están ocupadas). Tabla `ops_operation_alerts` + columna `ops_shipments.operation_id`:
   - campos: `id`, `shipment_id` → `ops_shipments`, `operation_id` nullable → `ops_operations`, `kind` CHECK con los 3 existentes + los 16, `severity` CHECK `('baja','media','alta')`, `status` CHECK `('abierta','cerrada')`, `source` (`automatica`/`manual`), `evidence_json`, `opened_by`, `opened_at`, `updated_at`, `closed_at`, `closed_by`, `close_reason`;
   - índice único parcial `(shipment_id, kind) WHERE status='abierta'`.
   - No se amplía `ops_alerts`, para no mezclar con la torre (línea de `out/arquitectura/INTEGRACION_CURSOR.md`).
2. **Severidad fija por `kind`** en un mapa similar a `KIND_SEVERITY`.
3. **Umbrales:** además de `OPS_ALERTA_ATRASO_MIN` (30) para la torre, clave `OPS_ALERTA_<X>_MIN` leída con `minutesFromEnv` (enteros entre 1 y 10.080; un valor inválido vuelve al default), como en `alert-config.ts`.
4. **Evaluador automático:** `POST /api/ops/alertas/evaluar`, con el mismo esquema que `/senal`: `opsGuard`, flag hijo propuesto `OPS_INCIDENCIAS_ENABLED` y **reutilizando** `OPS_ALERTAS_JOB_SECRET` (no se crean claves nuevas).
5. **Registro manual:** `POST /api/ops/envios/{id}/incidencias`, con sesión y permiso operativo.
6. **Auditoría al abrir y al cerrar.** **Nunca** se expone en `/seguimiento/{token}` (caso CPI-T01).

| Prio | Código | Impacto / esfuerzo | `kind` / tabla | Clave de umbral (default) | `severity` | Evaluador / disparador | Fuentes que lee | Casos |
|---|---|---|---|---|---|---|---|---|
| **P1** | `retiro_no_iniciado` | Alto / bajo | `retiro_no_iniciado` en `ops_operation_alerts` | `OPS_ALERTA_RETIRO_MIN` (30) | `alta` | Evaluador automático | `ops_shipments.planned_pickup_at`, `ops_geofences(origen)`, `trip_gps_points` | CPI-09-P/N/B, T02, T03 |
| **P1** | `espera_destino` | Alto / bajo (cubre el hueco de `detencion`) | `espera_destino` | `OPS_ALERTA_ESPERA_DESTINO_MIN` (60) | `media` | Evaluador automático | `ops_geofences(destino)`, `trip_gps_points`, `pod_evidence` | CPI-02 |
| **P1** | `desvio_geocerca` | Alto / bajo-medio (variantes a y c; la b es heurística) | `desvio_geocerca` | `OPS_ALERTA_DESVIO_MIN` (15), `OPS_ALERTA_DESVIO_PUNTOS` (3) | `alta` | Evaluador automático, idealmente también al recalcular el ETA | `ops_geofences`, `trip_gps_points`, `ops_eta_snapshots` | CPI-01 |
| **P1** | `evidencia_faltante` | Alto (bloquea el cierre) / bajo | `evidencia_faltante` | `OPS_ALERTA_EVIDENCIA_MIN` (120) | `media` | Evaluador automático | `ops_shipments.stage`, `pod_evidence` | CPI-12 |
| **P1** | `sin_asignar` | Alto / bajo | `sin_asignar` | `OPS_ALERTA_SIN_ASIGNAR_MIN` (1440) | `media` | Evaluador automático | `ops_shipments (stage, planned_pickup_at, assigned_offer_id)` | CPI-08 |
| **P1** | `documento_vencido` | Muy alto (legal y seguridad) / medio (vínculo por `offers.carrier_id` → `transportistas.user_id`) | `documento_vencido` | — (fecha del viaje) | `alta` | Evaluador automático, en la etapa `asignacion` | `documentos_acreditacion`, `ops_shipments` | CPI-06 |
| **P2** | `siniestro` | Muy alto / medio (registro manual y redacción de datos personales) | `siniestro` | — | `alta` | Registro manual | Formulario | CPI-03 |
| **P2** | `rechazo_entrega` | Alto / medio | `rechazo_entrega` | — | `alta` | Manual o POD | `pod_evidence` | CPI-04 |
| **P2** | `entrega_con_reparos` | Alto / medio | `entrega_con_reparos` | — | `alta` | Manual o POD | `pod_evidence` | CPI-05 |
| **P2** | `sin_contacto` | Alto / medio | `sin_contacto` | `OPS_ALERTA_SIN_CONTACTO_INTENTOS` (3) | `alta` | Registro manual | Formulario | CPI-11 |
| **P2** | `documento_faltante` | Alto / medio (lista obligatoria y vínculo) | `documento_faltante` | — (lista 2.1) | `alta` | Evaluador automático | `documentos_acreditacion` | CPI-07 |
| **P2** | `cierre_pendiente` | Medio / bajo | `cierre_pendiente` | `OPS_ALERTA_CIERRE_MIN` (2880) | `baja` | Evaluador automático | `ops_shipments (stage, updated_at)` | CPI-13 |
| **P3** | `cambio_no_verificado` | Alto / alto (no hay columna de conductor ni de patente asignados) | `cambio_no_verificado` | — | `alta` | Manual, hasta que exista la fuente | PROPUESTA de fuente | CPI-10 |
| **P3** | `incidente_seguridad` | Alto / medio (el PR #55 ya quitó el riesgo principal) | `incidente_seguridad` | — | `alta` | Revisión de contenido dentro del evaluador | `ops_operation_alerts.evidence_json`, respuesta pública | CPI-16 |
| **P3** | `temperatura_fuera_rango` | Alto si aplica / alto (sin fuente) | `temperatura_fuera_rango` | `OPS_ALERTA_TEMPERATURA_MIN` (15) | `alta` | Pendiente de fuente | — | CPI-15 |
| **P3** | `diferencia_costo` | Alto / **fuera de alcance** (pagos y finanzas) | `diferencia_costo` | `OPS_ALERTA_DIFERENCIA_COSTO_PCT` (por definir) | `alta` | Solo registro y escalamiento a JEFE BASTIAN | Expediente P-07 | CPI-14 |

Casos transversales que aplican a todas: CPI-T01 a CPI-T08 (enlace público, flag, unicidad, `CHECK` de severidad, que el bot no contacte a nadie, `OPS_ALERTA_ATRASO_MIN`, vínculo operación → envío y bloqueo del secreto).

**Alcance del PR de la migración ops_operation_alerts:** esquema para los 19 kinds, evaluador de las 6 P1, registro manual de las 4 P2 manuales y cierre con rastro. `documento_faltante`, `cierre_pendiente` y las P3 quedan para PR posteriores (su `kind` ya está admitido).

**Fuera de alcance de este catálogo y de su implementación:** claves y secretos (solo se reutiliza `OPS_ALERTAS_JOB_SECRET`), pagos, DNS, textos legales y envíos externos.

---

## 7. Mapeo a tablas

| Incidencia | `ops_alert_rules` | `ops_alerts` | `ops_geofences` | Tabla destino |
|---|---|---|---|---|
| `atraso`, `detencion`, `sin_senal` | `kind`, `threshold_min` | `kind`, `severity`, `status`, `evidence_json`, `opened_at` | `destino` (atraso y detención) | `ops_alerts` [CÓDIGO] |
| `desvio_geocerca`, `espera_destino`, `retiro_no_iniciado` | — (el `CHECK` no lo permite; el umbral va por configuración) | — | `point`, `lat`, `lng`, `radius_m` | `ops_operation_alerts` (migración ops_operation_alerts) |
| Las otras 13 | — | — | — | `ops_operation_alerts` (migración ops_operation_alerts) |
| Vínculo con la operación | — | — | — | `ops_shipments.operation_id` (migración ops_operation_alerts) → `ops_operations.id`; se copia a `ops_operation_alerts.operation_id` al abrir |

**PROPUESTA para más adelante:**
- umbrales por envío para los kinds nuevos: tabla `ops_operation_alert_rules`, o ampliar el `CHECK` de `ops_alert_rules`;
- `ops_geofences.point` con `corredor` / `parada`;
- `closed_at`, `closed_by` y `close_reason` también en `ops_alerts` (la migración ops_operation_alerts solo los trae en la tabla nueva).

---

## 8. Supuestos, desalineaciones y puntos abiertos

### 8.1 Resueltas con el PR #55 (`facd763` / `be067cb`)
- ✅ **Severidad:** existe en `ops_alerts`, con `baja`/`media`/`alta`. El catálogo ya usa esa escala.
- ✅ **El enlace público ya no muestra alertas** ni dispara su revisión.
- ◐ **Umbrales configurables:** solo `detencion` y `sin_senal`. `atraso` sigue fijo en 30. El conflicto con el QA (30/20) sigue abierto como decisión: el código conserva 20/45 a propósito (`.env.example`).
- ◐ **Evaluador periódico:** solo `sin_senal`, y sin cron. `atraso` y `detencion` dependen de que llegue GPS o de que alguien consulte el envío.

### 8.1-bis Resueltas por las decisiones de JEFE BASTIAN (17-11-2026)
- ✅ **Tabla nueva:** `ops_operation_alerts` en la **migración ops_operation_alerts**, aprobada como propuesta para PR (decisión 2).
- ✅ **Umbrales oficiales:** 20/45/30, los del código. El QA se corrige con `CORRECCION_PLAN_QA_UMBRALES.md`; `atraso` pasará a ser configurable con `OPS_ALERTA_ATRASO_MIN` (decisión 3).
- ✅ **Quién y cada cuánto evalúa:** DevOps, con un timer systemd cada 5 min (decisión 4). Queda bloqueado por el secreto.
- ✅ **Vínculo:** operación → envío → transportista definido (decisión 5). La pieza que falta en el código está identificada: `ops_shipments.operation_id`, más un camino de código que la escriba.
- ✅ **TWR-16:** el enlace público no muestra ningún estado de alerta; corregido en la corrección del QA.
- ✅ **Producción:** registrada como información de JEFE BASTIAN (08:16).

### 8.2 Siguen abiertas
1. **Hasta que la migración ops_operation_alerts esté implementada y desplegada,** `kind` sigue limitado a 3 valores. Las 16 PROPUESTA no se pueden registrar en la base, la regla «registrar apenas ocurre» solo se cumple en la base para los 3 tipos existentes. Para el resto, el agente debe llevar un registro transitorio propio, marcado EJEMPLO mientras se trabaje con datos de prueba, sin escribir en la base.
2. **La severidad es estática por tipo.** No sube con la duración, y las filas anteriores a la 031 quedan en `media` aunque sean `detencion` o `sin_senal`.
3. **El cierre en `ops_alerts` no deja rastro:** ni auditoría, ni evento, ni `closed_at`. La migración ops_operation_alerts lo resuelve solo para la tabla nueva.
4. **Identificadores:** el formato oficial es `360-YYMM-NNNN` (030, con el YYMM en America/Santiago desde el PR #58). Falta implementar `ops_shipments.operation_id` (migración ops_operation_alerts) y su escritura. `ops_operations.estado` solo admite `'planificada'`, así que los 6 estados del ciclo no existen en una columna. El procedimiento manual (`C360-AAAAMMDD-NNN`) sigue sin alinear.
5. **Etapas:** la equivalencia validada = `negociacion` es un supuesto; «solicitada» no existe en `ops_shipments`.
6. **Geocercas:** solo círculos de origen y destino. No hay corredor de ruta.
7. **`ops_shipments.carrier_org_id`** (organización) no se vincula con `transportistas`. Se usa el camino por la asignación vigente (`offers.carrier_id` → `transportistas.user_id`). Hay que confirmar que cada usuario tiene un solo `transportistas`; si no, la regla de documentos no se evalúa (espec. de la migración ops_operation_alerts §3).
8. **Sin fuente** para el conductor o la patente asignados (INC-10) ni para la temperatura (INC-15).
9. **Producción:** lo informado por JEFE BASTIAN (08:16) no fue verificado por este agente. La 032 (`ai_router_usage`) no estaría en producción.
10. **Bloqueo externo:** `OPS_ALERTAS_JOB_SECRET`, que define Gerencia. Sin él, `/senal` y el futuro `/evaluar` responden 503 y el timer de DevOps no corre.
11. **Plan de QA corregido, pero no aplicado:** el `.patch` está listo y probado en seco; aplicarlo requiere OK.
12. **Seguridad (Nivel 3, solo JEFE BASTIAN):** el token del enlace se guarda en claro en `ops_tracking_links` y se escribe en la auditoría (`tracking.ts`, `issueTrackingLink`). El QA TWR-12 lo trata como defecto crítico. Fuera de alcance de este catálogo.

### 8.3 Supuestos
- Umbrales y plazos sugeridos.
- Roles genéricos.
- Fechas de las tablas en UTC; avisos en hora de Chile.
- La evidencia no lleva datos personales (Ley 19.628; QA TWR-10).
- Un documento que vence el día del viaje cuenta como vigente ese día (por confirmar).

### 8.4 Decisiones
- ~~Aprobar la tabla nueva~~ → resuelta (migración ops_operation_alerts).
- ~~Umbrales oficiales~~ → resuelta (20/45/30).
- ~~Quién programa el evaluador~~ → resuelta (DevOps, systemd, cada 5 min).
- ~~Vínculo~~ → resuelta (modelo de la 030 + `ops_shipments.operation_id`).

**Siguen pendientes:**
1. Gerencia: definir `OPS_ALERTAS_JOB_SECRET` (bloqueo externo).
2. Gerencia: el umbral de `diferencia_costo` (fuera de alcance: pagos) y los plazos `{T-x}` del procedimiento.
3. JEFE BASTIAN: encargar a Cursor el PR de la migración ops_operation_alerts y aprobar el patch del plan de QA.
4. JEFE BASTIAN: revisar el hallazgo de seguridad del token en claro (8.2-12).

---

## 9. Ejemplos — **EJEMPLO** (datos ficticios)

### 9.1 Fila compatible con `ops_alerts` en `dacb93e`

```json
{
  "_marca": "EJEMPLO",
  "tabla": "ops_alerts",
  "id": "00000000-0000-4000-8000-00000000a001",
  "shipment_id": "00000000-0000-4000-8000-00000000e001",
  "kind": "atraso",
  "status": "abierta",
  "severity": "media",
  "evidence_json": {
    "etaAt": "2026-11-18T16:40:00.000Z",
    "plannedDeliveryAt": "2026-11-18T16:00:00.000Z",
    "umbralMin": 30,
    "gpsPointId": "00000000-0000-4000-8000-000000000c01",
    "truckAware": false
  },
  "opened_at": "2026-11-18T14:05:00.000Z",
  "updated_at": "2026-11-18T14:05:00.000Z"
}
```

En hora de Chile: entrega planificada el 18-11-2026 a las 13:00, ETA 13:40 y alerta abierta a las 11:05 (UTC-3). El ETA supera el plan en 40 min, más que el umbral de 30.

### 9.2 Fila PROPUESTA en `ops_operation_alerts` (migración ops_operation_alerts; `operation_id` en el formato `360-YYMM-NNNN`, EJEMPLO)

```json
{
  "_marca": "EJEMPLO",
  "_estado": "PROPUESTA (migración ops_operation_alerts, aprobada para PR; no existe aún)",
  "tabla": "ops_operation_alerts",
  "id": "00000000-0000-4000-8000-00000000b009",
  "shipment_id": "00000000-0000-4000-8000-000000009909",
  "operation_id": "360-2611-9909",
  "kind": "retiro_no_iniciado",
  "severity": "alta",
  "status": "abierta",
  "source": "automatica",
  "evidence_json": { "plannedPickupAt": "2026-11-18T13:00:00Z", "minutos": 45, "umbralMin": 30, "dentroOrigen": false },
  "opened_at": "2026-11-18T13:45:00Z",
  "updated_at": "2026-11-18T13:45:00Z",
  "closed_at": null,
  "closed_by": null,
  "close_reason": null,
  "_gestion_agente": {
    "agente": "C360-TRACK",
    "avisa_a": "Coordinador de operaciones",
    "escala_a": "Jefatura de operaciones a las 2026-11-18T14:15:00Z (11:15 hora de Chile)",
    "propuesta_aviso": "B3 — Incidencia (borrador; lo envía el Coordinador, no el bot)",
    "requiere_aprobacion_humana": true,
    "escalar_a_jefe_bastian": false
  }
}
```

---

*Fin. Versión final del 17-11-2026. Carga360go.*
