# Casos de prueba de incidencias — Carga360go

**Estado:** versión final para QA · 17-11-2026 (hora de Chile, UTC-3)
**Alcance:** las 16 incidencias PROPUESTA de `CATALOGO_INCIDENCIAS_ALERTAS.md` (misma carpeta). Solo documento: no hay código implementado ni pruebas ejecutadas.
**Código de referencia:** `origin/release/2026-11-15` en `f5b5893` (incluye el PR #55, merge `be067cb`, y el PR #59 con la 032). Especificación: `ESPEC_PR_ops_operation_alerts.md`.
**Datos:** todos marcados **EJEMPLO**, con operaciones ficticias en el formato real `360-YYMM-NNNN`: `360-2611-9901` a `360-2611-9916`. Cada envío EJEMPLO lleva `ops_shipments.operation_id` igual a su operación (columna que agrega la migración ops_operation_alerts). Fixtures en `fixtures_incidencias_EJEMPLO.json`.

**Total: 56 casos** = 16 incidencias × 3 (positivo, negativo y borde) + 8 transversales.

## 1. Lo que ya está cubierto y no se duplica

| Tema | Ya cubierto en | Qué agrega este archivo |
|---|---|---|
| `atraso`, `detencion`, `sin_senal` (las 3 existentes) | `out/equipo/QA_PLAN_OPS.md` TWR-07 a TWR-11; `tests/ops-torre.test.ts` líneas 89 y 410 | Nada; fuera de este archivo |
| Enlace público sin alertas internas | `tests/ops-torre.test.ts` línea 343; QA TWR-16 | CPI-T01 (tablas nuevas) y CPI-16-B |
| Bordes de geocerca (dentro, borde, fuera; otro envío) | QA TWR-04, TWR-05, TWR-06 | Solo la lógica de desvío y espera (CPI-01, CPI-02) |
| Avisos previos de vencimiento (30, 15 y 7 días) | `tests/bassam-tablas.test.ts` (`runExpiryAlerts`, línea 156) | CPI-06: vencido **a la fecha del viaje** |
| No asignar a un transportista no acreditado | QA ASG-08, DES-06, E2E-03 | CPI-07: faltante o `pendiente_ok` como alerta del envío |
| Flags apagados = 404 | `tests/ops-torre.test.ts` línea 67; QA E2E-05 | CPI-T02 para las rutas nuevas |

## 2. Convenciones

- **Tabla esperada:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`, con `kind`, `severity` (`baja`/`media`/`alta`, la misma escala del código), `status` (`abierta`/`cerrada`), `evidence_json` y `opened_at`. Si Gerencia decide ampliar `ops_alerts` en vez de crear una tabla, cambia solo el nombre de la tabla.
- **Umbrales oficiales** (decisión de JEFE BASTIAN, 17-11-2026): los del código. `atraso` 30 (`OPS_ALERTA_ATRASO_MIN`, nueva en la migración ops_operation_alerts), `detencion` 20 (`OPS_ALERTA_DETENCION_MIN`) y `sin_senal` 45 (`OPS_ALERTA_SIN_SENAL_MIN`); los de los kinds nuevos son los de la espec. de la migración ops_operation_alerts. Para corregir el plan de QA, ver `CORRECCION_PLAN_QA_UMBRALES.md`.
- **Comparaciones:** los umbrales de minutos se comparan con `>=`, igual que `alerts.ts`, salvo `atraso`, que usa `>` (`alerts.ts`: `etaMs > planned + umbral`); los porcentajes con `>`.
- **Aprobación:** el registro de la alerta es automático. Toda acción (aviso, asignación, cierre) requiere aprobación humana; las de Nivel 3 se escalan solo a JEFE BASTIAN.
- **Contacto:** ningún caso espera que el bot contacte a clientes o transportistas; solo borradores.

## 3. Casos por incidencia

### CPI-01 · `desvio_geocerca` — Desvío o salida de geocerca

Operación EJEMPLO: **360-2611-9901** (`shipment_id` 00000000-0000-4000-8000-000000009901). Fuente: ops_geofences (point, lat, lng, radius_m) + trip_gps_points. Umbral: `OPS_ALERTA_DESVIO_MIN=15; OPS_ALERTA_DESVIO_PUNTOS=3`.


**CPI-01-P · Positivo**

- **Precondición:** Envío en `ejecucion` con geocercas de origen (radio 300 m) y destino (radio 500 m). Última posición fuera de origen. Operación 360-2611-9901 (EJEMPLO).
- **Datos (EJEMPLO):** `{"geocerca_destino": {"lat": -23.6509, "lng": -70.3975, "radius_m": 500}, "distancias_destino_m": [41200, 42050, 43100], "puntos_recorded_at": ["2026-11-18T13:00:00Z", "2026-11-18T13:05:00Z", "2026-11-18T13:10:00Z"]}`
- **Pasos:** 1. Cargar las 3 posiciones en orden. 2. Correr el evaluador de incidencias.
- **Resultado esperado:** Abre `desvio_geocerca` con las 3 distancias en la evidencia. Alerta: **sí** · código `desvio_geocerca` · severidad `alta` · avisa a: Coordinador de operaciones · escalamiento: 15 min → Jefatura de operaciones · aprobación humana: Sí (Nivel 2b).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_geofences (point, lat, lng, radius_m) + trip_gps_points.

**CPI-01-N · Negativo**

- **Precondición:** Igual que P. Operación 360-2611-9901 (EJEMPLO).
- **Datos (EJEMPLO):** `{"distancias_destino_m": [43100, 42050, 41200]}`
- **Pasos:** 1. Cargar las 3 posiciones (se acerca al destino). 2. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `desvio_geocerca`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_geofences (point, lat, lng, radius_m) + trip_gps_points.

**CPI-01-B · Borde**

- **Precondición:** Camión dentro del destino; nueva posición exactamente en el borde. Operación 360-2611-9901 (EJEMPLO).
- **Datos (EJEMPLO):** `{"geocerca_destino": {"radius_m": 500}, "distancia_ultima_m": 500.0, "inside_previo": true}`
- **Pasos:** 1. Cargar la posición en el borde. 2. Correr el evaluador.
- **Resultado esperado:** No abre: el borde cuenta como dentro (`distanceM <= radiusM`, igual que `eta.ts`). Control: 500,1 m tras estar dentro y sin POD abre la variante (c) salida de destino. Alerta: **no** (ninguna fila abierta de `desvio_geocerca`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_geofences (point, lat, lng, radius_m) + trip_gps_points.

### CPI-02 · `espera_destino` — Espera prolongada en destino sin entrega

Operación EJEMPLO: **360-2611-9902** (`shipment_id` 00000000-0000-4000-8000-000000009902). Fuente: ops_geofences point='destino' + trip_gps_points + pod_evidence. Umbral: `OPS_ALERTA_ESPERA_DESTINO_MIN=60`.


**CPI-02-P · Positivo**

- **Precondición:** Envío en `ejecucion`, dos posiciones dentro del destino, sin `pod_evidence`. Operación 360-2611-9902 (EJEMPLO).
- **Datos (EJEMPLO):** `{"puntos_dentro_destino": ["2026-11-18T13:00:00Z", "2026-11-18T14:10:00Z"], "pod_evidence": null}`
- **Pasos:** 1. Cargar ambas posiciones. 2. Correr el evaluador.
- **Resultado esperado:** Abre `espera_destino` (70 min ≥ 60). `detencion` sigue sin abrirse, como hoy en `alerts.ts`. Alerta: **sí** · código `espera_destino` · severidad `media` · avisa a: Coordinador de operaciones (I: Ejecutivo comercial) · escalamiento: 60 min → Jefatura de operaciones · aprobación humana: Sí (Nivel 2b).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_geofences point='destino' + trip_gps_points + pod_evidence.

**CPI-02-N · Negativo**

- **Precondición:** Igual que P, pero con POD registrado. Operación 360-2611-9902 (EJEMPLO).
- **Datos (EJEMPLO):** `{"puntos_dentro_destino": ["2026-11-18T13:00:00Z", "2026-11-18T14:10:00Z"], "pod_evidence": {"existe": true}}`
- **Pasos:** 1. Cargar posiciones y POD. 2. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `espera_destino`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_geofences point='destino' + trip_gps_points + pod_evidence.

**CPI-02-B · Borde**

- **Precondición:** Igual que P. Operación 360-2611-9902 (EJEMPLO).
- **Datos (EJEMPLO):** `{"puntos_dentro_destino": ["2026-11-18T13:00:00Z", "2026-11-18T14:00:00Z"]}`
- **Pasos:** 1. Cargar posiciones separadas por exactamente 60 min. 2. Correr el evaluador. 3. Control: 59 min.
- **Resultado esperado:** Abre con 60 min (comparación `>=`, igual que los umbrales actuales). Con 59 min no abre. Alerta: **sí** · código `espera_destino` · severidad `media` · avisa a: Coordinador de operaciones (I: Ejecutivo comercial) · escalamiento: 60 min → Jefatura de operaciones · aprobación humana: Sí (Nivel 2b).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_geofences point='destino' + trip_gps_points + pod_evidence.

### CPI-03 · `siniestro` — Accidente, robo o siniestro

Operación EJEMPLO: **360-2611-9903** (`shipment_id` 00000000-0000-4000-8000-000000009903). Fuente: Registro manual (POST de incidencia). Umbral: `— (manual, sin umbral)`.


**CPI-03-P · Positivo**

- **Precondición:** Envío en `ejecucion`. El Coordinador registra un reporte de siniestro. Operación 360-2611-9903 (EJEMPLO).
- **Datos (EJEMPLO):** `{"reporte": {"reportado_por": "Coordinador de operaciones (EJEMPLO)", "hora": "2026-11-18T15:20:00Z", "descripcion": "Colisión menor en ruta, sin lesionados (EJEMPLO)"}}`
- **Pasos:** 1. Registrar la incidencia manual. 2. Revisar la alerta y la cola de escalamiento.
- **Resultado esperado:** Abre `siniestro`, marca `escalar_a_jefe_bastian=true` y deja borradores A8/B3 **sin enviar**. Alerta: **sí** · código `siniestro` · severidad `alta` · avisa a: Jefatura de operaciones + Coordinador; Nivel 3 → JEFE BASTIAN · escalamiento: Inmediato → JEFE BASTIAN · aprobación humana: Sí, siempre (Nivel 3).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual (POST de incidencia).

**CPI-03-N · Negativo**

- **Precondición:** `detencion` y `sin_senal` abiertas a la vez, sin reporte. Operación 360-2611-9903 (EJEMPLO).
- **Datos (EJEMPLO):** `{"alertas_abiertas": ["detencion", "sin_senal"], "reporte": null}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre `siniestro` de forma automática; como mucho, una sugerencia de revisión para el Coordinador. Alerta: **no** (ninguna fila abierta de `siniestro`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual (POST de incidencia).

**CPI-03-B · Borde**

- **Precondición:** Reporte que trae RUT y teléfono del conductor en el texto. Operación 360-2611-9903 (EJEMPLO).
- **Datos (EJEMPLO):** `{"reporte": {"descripcion": "Robo de carga; conductor RUT 11.111.111-1, fono +56 9 0000 0000 (EJEMPLO)"}}`
- **Pasos:** 1. Registrar la incidencia manual. 2. Leer `evidence_json`.
- **Resultado esperado:** Abre `siniestro`, pero `evidence_json` no guarda el RUT ni el teléfono (se reemplazan por `[dato personal omitido]`). Alerta: **sí** · código `siniestro` · severidad `alta` · avisa a: Jefatura de operaciones + Coordinador; Nivel 3 → JEFE BASTIAN · escalamiento: Inmediato → JEFE BASTIAN · aprobación humana: Sí, siempre (Nivel 3).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual (POST de incidencia).

### CPI-04 · `rechazo_entrega` — Rechazo de la carga en destino

Operación EJEMPLO: **360-2611-9904** (`shipment_id` 00000000-0000-4000-8000-000000009904). Fuente: Registro manual / pod_evidence (observación). Umbral: `— (manual)`.


**CPI-04-P · Positivo**

- **Precondición:** Envío en destino. El transportista informa un rechazo total. Operación 360-2611-9904 (EJEMPLO).
- **Datos (EJEMPLO):** `{"reporte": {"tipo": "rechazo_total", "motivo": "Receptor rechaza por falta de orden de compra (EJEMPLO)"}}`
- **Pasos:** 1. Registrar la incidencia manual.
- **Resultado esperado:** Abre `rechazo_entrega`; borrador A8 para el Ejecutivo comercial y B3 para el Coordinador, sin enviar. Alerta: **sí** · código `rechazo_entrega` · severidad `alta` · avisa a: Coordinador de operaciones + Ejecutivo comercial · escalamiento: 30 min → Jefatura; si hay cobro → JEFE BASTIAN · aprobación humana: Sí (Nivel 2b; Nivel 3 si hay monto).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual / pod_evidence (observación).

**CPI-04-N · Negativo**

- **Precondición:** Envío en destino con POD conforme. Operación 360-2611-9904 (EJEMPLO).
- **Datos (EJEMPLO):** `{"pod_evidence": {"observaciones": "conforme"}}`
- **Pasos:** 1. Registrar el POD. 2. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `rechazo_entrega`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual / pod_evidence (observación).

**CPI-04-B · Borde**

- **Precondición:** Entrega parcial: se reciben 8 de 10 bultos, con reparos. Operación 360-2611-9904 (EJEMPLO).
- **Datos (EJEMPLO):** `{"pod_evidence": {"observaciones": "con reparos: recibe 8 de 10 bultos (EJEMPLO)"}}`
- **Pasos:** 1. Registrar el POD.
- **Resultado esperado:** No abre `rechazo_entrega`: abre `entrega_con_reparos` (CPI-05). Comprueba que no se clasifiquen dos veces. Alerta: **no** (ninguna fila abierta de `rechazo_entrega`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual / pod_evidence (observación).

### CPI-05 · `entrega_con_reparos` — Entrega con daño o faltante

Operación EJEMPLO: **360-2611-9905** (`shipment_id` 00000000-0000-4000-8000-000000009905). Fuente: pod_evidence (observaciones) / registro manual. Umbral: `— (manual)`.


**CPI-05-P · Positivo**

- **Precondición:** Envío en `pod`. Operación 360-2611-9905 (EJEMPLO).
- **Datos (EJEMPLO):** `{"pod_evidence": {"observaciones": "con reparos: 2 bultos con daño visible (EJEMPLO)"}}`
- **Pasos:** 1. Registrar el POD con reparos.
- **Resultado esperado:** Abre `entrega_con_reparos`; `escalar_a_jefe_bastian=false`. Alerta: **sí** · código `entrega_con_reparos` · severidad `alta` · avisa a: Coordinador de operaciones + Jefatura de operaciones · escalamiento: 2 h → Jefatura; reclamo con monto → JEFE BASTIAN · aprobación humana: Sí (Nivel 3 si hay monto).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: pod_evidence (observaciones) / registro manual.

**CPI-05-N · Negativo**

- **Precondición:** Envío en `pod`. Operación 360-2611-9905 (EJEMPLO).
- **Datos (EJEMPLO):** `{"pod_evidence": {"observaciones": "conforme"}}`
- **Pasos:** 1. Registrar el POD.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `entrega_con_reparos`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: pod_evidence (observaciones) / registro manual.

**CPI-05-B · Borde**

- **Precondición:** Reparos con un reclamo de monto del cliente. Operación 360-2611-9905 (EJEMPLO).
- **Datos (EJEMPLO):** `{"pod_evidence": {"observaciones": "con reparos"}, "reclamo_monto_clp": "EJEMPLO (monto ficticio)"}`
- **Pasos:** 1. Registrar el POD y el reclamo.
- **Resultado esperado:** Abre `entrega_con_reparos` y marca `escalar_a_jefe_bastian=true` (Nivel 3, financiera). El bot no calcula ni ofrece montos. Alerta: **sí** · código `entrega_con_reparos` · severidad `alta` · avisa a: Coordinador de operaciones + Jefatura de operaciones · escalamiento: 2 h → Jefatura; reclamo con monto → JEFE BASTIAN · aprobación humana: Sí (Nivel 3 si hay monto).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: pod_evidence (observaciones) / registro manual.

### CPI-06 · `documento_vencido` — Documento vencido a la fecha del viaje

Operación EJEMPLO: **360-2611-9906** (`shipment_id` 00000000-0000-4000-8000-000000009906). Fuente: documentos_acreditacion (tipo, vencimiento, estado_admin) + ops_shipments.planned_pickup_at. Umbral: `— (compara con la fecha del viaje; los avisos previos de 30/15/7 días ya existen en runExpiryAlerts)`.


**CPI-06-P · Positivo**

- **Precondición:** Envío en `asignacion`, retiro el 18-11-2026, transportista con SOAP vencido. Operación 360-2611-9906 (EJEMPLO).
- **Datos (EJEMPLO):** `{"documento": {"tipo": "soap", "vencimiento": "2026-11-15", "estado_admin": "aprobado"}, "planned_pickup_at": "2026-11-18T13:00:00Z"}`
- **Pasos:** 1. Correr el evaluador en la etapa de asignación.
- **Resultado esperado:** Abre `documento_vencido`; la acción sugerida es **no asignar**. Alerta: **sí** · código `documento_vencido` · severidad `alta` · avisa a: Coordinador de operaciones · escalamiento: 2 h → Jefatura de operaciones · aprobación humana: Sí; no asignar.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: documentos_acreditacion (tipo, vencimiento, estado_admin) + ops_shipments.planned_pickup_at.

**CPI-06-N · Negativo**

- **Precondición:** Igual que P, con un SOAP vigente. Operación 360-2611-9906 (EJEMPLO).
- **Datos (EJEMPLO):** `{"documento": {"tipo": "soap", "vencimiento": "2026-12-31", "estado_admin": "aprobado"}, "planned_pickup_at": "2026-11-18T13:00:00Z"}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `documento_vencido`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: documentos_acreditacion (tipo, vencimiento, estado_admin) + ops_shipments.planned_pickup_at.

**CPI-06-B · Borde**

- **Precondición:** El documento vence el mismo día del retiro. Operación 360-2611-9906 (EJEMPLO).
- **Datos (EJEMPLO):** `{"documento": {"tipo": "soap", "vencimiento": "2026-11-18", "estado_admin": "aprobado"}, "planned_pickup_at": "2026-11-18T13:00:00Z"}`
- **Pasos:** 1. Correr el evaluador. 2. Control: vencimiento 2026-11-17.
- **Resultado esperado:** No abre (vigente durante su último día; **supuesto por confirmar**). Con 2026-11-17 abre. Alerta: **no** (ninguna fila abierta de `documento_vencido`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: documentos_acreditacion (tipo, vencimiento, estado_admin) + ops_shipments.planned_pickup_at.

### CPI-07 · `documento_faltante` — Documento obligatorio faltante o no aprobado

Operación EJEMPLO: **360-2611-9907** (`shipment_id` 00000000-0000-4000-8000-000000009907). Fuente: documentos_acreditacion (lista 2.1 del procedimiento). Umbral: `— (lista de tipos obligatorios)`.


**CPI-07-P · Positivo**

- **Precondición:** Envío en `asignacion`; al transportista le falta la licencia. Operación 360-2611-9907 (EJEMPLO).
- **Datos (EJEMPLO):** `{"documentos": [{"tipo": "soap", "estado_admin": "aprobado"}, {"tipo": "revision_tecnica", "estado_admin": "aprobado"}], "falta": "licencia"}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** Abre `documento_faltante` con la lista de faltantes en la evidencia. Alerta: **sí** · código `documento_faltante` · severidad `alta` · avisa a: Coordinador de operaciones · escalamiento: 2 h → Jefatura de operaciones · aprobación humana: Sí; no asignar.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: documentos_acreditacion (lista 2.1 del procedimiento).

**CPI-07-N · Negativo**

- **Precondición:** Todos los documentos obligatorios están aprobados. Operación 360-2611-9907 (EJEMPLO).
- **Datos (EJEMPLO):** `{"documentos": "todos los de la lista 2.1, estado_admin='aprobado' (EJEMPLO)"}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `documento_faltante`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: documentos_acreditacion (lista 2.1 del procedimiento).

**CPI-07-B · Borde**

- **Precondición:** La licencia existe, pero sigue en revisión. Operación 360-2611-9907 (EJEMPLO).
- **Datos (EJEMPLO):** `{"documento": {"tipo": "licencia", "estado_admin": "pendiente_ok"}}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** Abre: `pendiente_ok` no cuenta como aprobado. Alerta: **sí** · código `documento_faltante` · severidad `alta` · avisa a: Coordinador de operaciones · escalamiento: 2 h → Jefatura de operaciones · aprobación humana: Sí; no asignar.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: documentos_acreditacion (lista 2.1 del procedimiento).

### CPI-08 · `sin_asignar` — Operación sin asignar a tiempo

Operación EJEMPLO: **360-2611-9908** (`shipment_id` 00000000-0000-4000-8000-000000009908). Fuente: ops_shipments (stage, planned_pickup_at, assigned_offer_id). Umbral: `OPS_ALERTA_SIN_ASIGNAR_MIN=1440`.


**CPI-08-P · Positivo**

- **Precondición:** `stage='asignacion'`, sin `assigned_offer_id`. Operación 360-2611-9908 (EJEMPLO).
- **Datos (EJEMPLO):** `{"ahora": "2026-11-18T03:00:00Z", "planned_pickup_at": "2026-11-18T13:00:00Z", "assigned_offer_id": null}`
- **Pasos:** 1. Correr el evaluador (faltan 10 h).
- **Resultado esperado:** Abre `sin_asignar`. Alerta: **sí** · código `sin_asignar` · severidad `media` · avisa a: Coordinador de operaciones + Ejecutivo comercial · escalamiento: 1 h → Jefatura de operaciones · aprobación humana: Sí (la asignación la confirma una persona).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments (stage, planned_pickup_at, assigned_offer_id).

**CPI-08-N · Negativo**

- **Precondición:** Igual que P, pero faltan 30 h. Operación 360-2611-9908 (EJEMPLO).
- **Datos (EJEMPLO):** `{"ahora": "2026-11-17T07:00:00Z", "planned_pickup_at": "2026-11-18T13:00:00Z", "assigned_offer_id": null}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `sin_asignar`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments (stage, planned_pickup_at, assigned_offer_id).

**CPI-08-B · Borde**

- **Precondición:** Faltan exactamente 1440 min. Operación 360-2611-9908 (EJEMPLO).
- **Datos (EJEMPLO):** `{"ahora": "2026-11-17T13:00:00Z", "planned_pickup_at": "2026-11-18T13:00:00Z", "assigned_offer_id": null}`
- **Pasos:** 1. Correr el evaluador. 2. Asignar una oferta y volver a correrlo.
- **Resultado esperado:** Abre justo en 1440 min (`<=`). Al tener `assigned_offer_id`, la alerta se cierra. Alerta: **sí** · código `sin_asignar` · severidad `media` · avisa a: Coordinador de operaciones + Ejecutivo comercial · escalamiento: 1 h → Jefatura de operaciones · aprobación humana: Sí (la asignación la confirma una persona).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments (stage, planned_pickup_at, assigned_offer_id).

### CPI-09 · `retiro_no_iniciado` — Retiro no iniciado a la hora programada

Operación EJEMPLO: **360-2611-9909** (`shipment_id` 00000000-0000-4000-8000-000000009909). Fuente: ops_shipments.planned_pickup_at + ops_geofences point='origen' + trip_gps_points. Umbral: `OPS_ALERTA_RETIRO_MIN=30`.


**CPI-09-P · Positivo**

- **Precondición:** Envío asignado, sin posiciones dentro del origen. Operación 360-2611-9909 (EJEMPLO).
- **Datos (EJEMPLO):** `{"planned_pickup_at": "2026-11-18T13:00:00Z", "ahora": "2026-11-18T13:45:00Z", "puntos_dentro_origen": []}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** Abre `retiro_no_iniciado` (45 min ≥ 30). Alerta: **sí** · código `retiro_no_iniciado` · severidad `alta` · avisa a: Coordinador de operaciones · escalamiento: 30 min → Jefatura de operaciones · aprobación humana: Sí (Nivel 2b).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments.planned_pickup_at + ops_geofences point='origen' + trip_gps_points.

**CPI-09-N · Negativo**

- **Precondición:** Hay una posición dentro del origen 10 min después de la hora. Operación 360-2611-9909 (EJEMPLO).
- **Datos (EJEMPLO):** `{"planned_pickup_at": "2026-11-18T13:00:00Z", "ahora": "2026-11-18T13:45:00Z", "puntos_dentro_origen": ["2026-11-18T13:10:00Z"]}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `retiro_no_iniciado`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments.planned_pickup_at + ops_geofences point='origen' + trip_gps_points.

**CPI-09-B · Borde**

- **Precondición:** Faltan posiciones y han pasado exactamente 30 min. Operación 360-2611-9909 (EJEMPLO).
- **Datos (EJEMPLO):** `{"planned_pickup_at": "2026-11-18T13:00:00Z", "ahora": "2026-11-18T13:30:00Z", "puntos_dentro_origen": []}`
- **Pasos:** 1. Correr el evaluador. 2. Control: 29 min.
- **Resultado esperado:** Abre a los 30 min. Con 29 no abre. Alerta: **sí** · código `retiro_no_iniciado` · severidad `alta` · avisa a: Coordinador de operaciones · escalamiento: 30 min → Jefatura de operaciones · aprobación humana: Sí (Nivel 2b).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments.planned_pickup_at + ops_geofences point='origen' + trip_gps_points.

### CPI-10 · `cambio_no_verificado` — Cambio de conductor o vehículo sin verificar

Operación EJEMPLO: **360-2611-9910** (`shipment_id` 00000000-0000-4000-8000-000000009910). Fuente: PROPUESTA: patente/conductor asignados vs informados (hoy sin columna). Umbral: `— (comparación)`.


**CPI-10-P · Positivo**

- **Precondición:** Asignación con patente EJ-AA-11. Se informa otra patente sin lista 2.2. Operación 360-2611-9910 (EJEMPLO).
- **Datos (EJEMPLO):** `{"patente_asignada": "EJ-AA-11", "patente_informada": "EJ-ZZ-99", "checklist_2_2_repetido": false}`
- **Pasos:** 1. Registrar el cambio informado. 2. Correr el evaluador.
- **Resultado esperado:** Abre `cambio_no_verificado`; borrador del nuevo A4, sin enviar. Alerta: **sí** · código `cambio_no_verificado` · severidad `alta` · avisa a: Coordinador de operaciones · escalamiento: 1 h → Jefatura de operaciones · aprobación humana: Sí (repetir la lista 2.2).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: PROPUESTA: patente/conductor asignados vs informados (hoy sin columna).

**CPI-10-N · Negativo**

- **Precondición:** La patente informada coincide. Operación 360-2611-9910 (EJEMPLO).
- **Datos (EJEMPLO):** `{"patente_asignada": "EJ-AA-11", "patente_informada": "EJ-AA-11"}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `cambio_no_verificado`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: PROPUESTA: patente/conductor asignados vs informados (hoy sin columna).

**CPI-10-B · Borde**

- **Precondición:** Cambio de patente con lista 2.2 repetida y validada antes del retiro. Operación 360-2611-9910 (EJEMPLO).
- **Datos (EJEMPLO):** `{"patente_asignada": "EJ-AA-11", "patente_informada": "EJ-ZZ-99", "checklist_2_2_repetido": true, "validado_antes_de_retiro": true}`
- **Pasos:** 1. Registrar el cambio y la lista. 2. Correr el evaluador.
- **Resultado esperado:** No abre alerta (cambio verificado). Alerta: **no** (ninguna fila abierta de `cambio_no_verificado`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: PROPUESTA: patente/conductor asignados vs informados (hoy sin columna).

### CPI-11 · `sin_contacto` — Sin contacto con el transportista

Operación EJEMPLO: **360-2611-9911** (`shipment_id` 00000000-0000-4000-8000-000000009911). Fuente: Registro manual de intentos. Umbral: `OPS_ALERTA_SIN_CONTACTO_INTENTOS=3 (sugerido)`.


**CPI-11-P · Positivo**

- **Precondición:** Envío en `ejecucion`. Operación 360-2611-9911 (EJEMPLO).
- **Datos (EJEMPLO):** `{"intentos_sin_respuesta": 3}`
- **Pasos:** 1. Registrar los 3 intentos.
- **Resultado esperado:** Abre `sin_contacto`. Alerta: **sí** · código `sin_contacto` · severidad `alta` · avisa a: Coordinador → Jefatura de operaciones · escalamiento: Plazo de P-05 `{por definir}` → Jefatura; inmediato si `sin_senal` está abierta · aprobación humana: Sí (Nivel 2b).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual de intentos.

**CPI-11-N · Negativo**

- **Precondición:** Un intento sin respuesta y luego el conductor contesta. Operación 360-2611-9911 (EJEMPLO).
- **Datos (EJEMPLO):** `{"intentos_sin_respuesta": 1, "respuesta": true}`
- **Pasos:** 1. Registrar el intento y la respuesta.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `sin_contacto`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual de intentos.

**CPI-11-B · Borde**

- **Precondición:** 3 intentos sin respuesta con `sin_senal` abierta. Operación 360-2611-9911 (EJEMPLO).
- **Datos (EJEMPLO):** `{"intentos_sin_respuesta": 3, "alertas_abiertas": ["sin_senal"]}`
- **Pasos:** 1. Registrar los intentos.
- **Resultado esperado:** Abre `sin_contacto` con escalamiento **inmediato** a Jefatura (no espera el plazo). Alerta: **sí** · código `sin_contacto` · severidad `alta` · avisa a: Coordinador → Jefatura de operaciones · escalamiento: Plazo de P-05 `{por definir}` → Jefatura; inmediato si `sin_senal` está abierta · aprobación humana: Sí (Nivel 2b).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Registro manual de intentos.

### CPI-12 · `evidencia_faltante` — POD faltante o incompleto

Operación EJEMPLO: **360-2611-9912** (`shipment_id` 00000000-0000-4000-8000-000000009912). Fuente: pod_evidence + ops_shipments.stage. Umbral: `OPS_ALERTA_EVIDENCIA_MIN=120`.


**CPI-12-P · Positivo**

- **Precondición:** Envío en `pod` hace 3 h, sin fila en `pod_evidence`. Operación 360-2611-9912 (EJEMPLO).
- **Datos (EJEMPLO):** `{"stage": "pod", "desde": "2026-11-18T13:00:00Z", "ahora": "2026-11-18T16:00:00Z", "pod_evidence": null}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** Abre `evidencia_faltante`; borrador B3, sin enviar. Alerta: **sí** · código `evidencia_faltante` · severidad `media` · avisa a: Coordinador de operaciones · escalamiento: 24 h → Jefatura de operaciones · aprobación humana: Sí, para pedirla al transportista.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: pod_evidence + ops_shipments.stage.

**CPI-12-N · Negativo**

- **Precondición:** POD completo. Operación 360-2611-9912 (EJEMPLO).
- **Datos (EJEMPLO):** `{"pod_evidence": {"fotos": 2, "receptor": "EJEMPLO", "rut_receptor": "presente (EJEMPLO)", "firma": true, "fecha_hora": "2026-11-18T13:20:00Z"}}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `evidencia_faltante`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: pod_evidence + ops_shipments.stage.

**CPI-12-B · Borde**

- **Precondición:** POD sin el RUT del receptor. Operación 360-2611-9912 (EJEMPLO).
- **Datos (EJEMPLO):** `{"pod_evidence": {"fotos": 2, "receptor": "EJEMPLO", "rut_receptor": null, "firma": true}}`
- **Pasos:** 1. Correr el evaluador después de 120 min.
- **Resultado esperado:** Abre: falta un campo obligatorio. La evidencia lista el campo faltante, no su valor. Alerta: **sí** · código `evidencia_faltante` · severidad `media` · avisa a: Coordinador de operaciones · escalamiento: 24 h → Jefatura de operaciones · aprobación humana: Sí, para pedirla al transportista.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: pod_evidence + ops_shipments.stage.

### CPI-13 · `cierre_pendiente` — Cierre fuera de plazo

Operación EJEMPLO: **360-2611-9913** (`shipment_id` 00000000-0000-4000-8000-000000009913). Fuente: ops_shipments (stage, updated_at). Umbral: `OPS_ALERTA_CIERRE_MIN=2880`.


**CPI-13-P · Positivo**

- **Precondición:** Envío en `pod` desde hace 3 días. Operación 360-2611-9913 (EJEMPLO).
- **Datos (EJEMPLO):** `{"stage": "pod", "updated_at": "2026-11-15T13:00:00Z", "ahora": "2026-11-18T13:00:00Z"}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** Abre `cierre_pendiente`. Alerta: **sí** · código `cierre_pendiente` · severidad `baja` · avisa a: Coordinador de operaciones + Administración y control de costos · escalamiento: 48 h → Jefatura de operaciones · aprobación humana: Sí, para cerrar.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments (stage, updated_at).

**CPI-13-N · Negativo**

- **Precondición:** Envío en `pod` desde hace 1 día. Operación 360-2611-9913 (EJEMPLO).
- **Datos (EJEMPLO):** `{"stage": "pod", "updated_at": "2026-11-17T13:00:00Z", "ahora": "2026-11-18T13:00:00Z"}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `cierre_pendiente`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments (stage, updated_at).

**CPI-13-B · Borde**

- **Precondición:** Exactamente 2880 min; luego pasa a `cerrado`. Operación 360-2611-9913 (EJEMPLO).
- **Datos (EJEMPLO):** `{"stage": "pod", "updated_at": "2026-11-16T13:00:00Z", "ahora": "2026-11-18T13:00:00Z"}`
- **Pasos:** 1. Correr el evaluador. 2. Cambiar la etapa a `cerrado` y volver a correrlo.
- **Resultado esperado:** Abre a los 2880 min y se cierra al llegar a `cerrado`. Alerta: **sí** · código `cierre_pendiente` · severidad `baja` · avisa a: Coordinador de operaciones + Administración y control de costos · escalamiento: 48 h → Jefatura de operaciones · aprobación humana: Sí, para cerrar.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: ops_shipments (stage, updated_at).

### CPI-14 · `diferencia_costo` — Diferencia de costo real vs estimado

Operación EJEMPLO: **360-2611-9914** (`shipment_id` 00000000-0000-4000-8000-000000009914). Fuente: Fuera de las tablas de seguimiento (expediente P-07). Umbral: `OPS_ALERTA_DIFERENCIA_COSTO_PCT (sin valor; por definir)`.


**CPI-14-P · Positivo**

- **Precondición:** Umbral EJEMPLO 10 %. Operación 360-2611-9914 (EJEMPLO).
- **Datos (EJEMPLO):** `{"costo_estimado": "100 (unidades ficticias)", "costo_real": "115 (unidades ficticias)", "umbral_pct": 10}`
- **Pasos:** 1. Registrar el costo real. 2. Correr el evaluador.
- **Resultado esperado:** Abre `diferencia_costo` (15 % > 10 %) y la escala solo a JEFE BASTIAN. El bot no cambia montos. Alerta: **sí** · código `diferencia_costo` · severidad `alta` · avisa a: Administración y control de costos; Nivel 3 → JEFE BASTIAN · escalamiento: Inmediato → JEFE BASTIAN · aprobación humana: Sí (Nivel 3, financiera).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Fuera de las tablas de seguimiento (expediente P-07).

**CPI-14-N · Negativo**

- **Precondición:** Umbral EJEMPLO 10 %. Operación 360-2611-9914 (EJEMPLO).
- **Datos (EJEMPLO):** `{"costo_estimado": "100", "costo_real": "105", "umbral_pct": 10}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `diferencia_costo`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Fuera de las tablas de seguimiento (expediente P-07).

**CPI-14-B · Borde**

- **Precondición:** Diferencia exactamente igual al umbral. Operación 360-2611-9914 (EJEMPLO).
- **Datos (EJEMPLO):** `{"costo_estimado": "100", "costo_real": "110", "umbral_pct": 10}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre (la regla es `> umbral`). Sin costo estimado, no se calcula y se registra el dato faltante. Alerta: **no** (ninguna fila abierta de `diferencia_costo`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Fuera de las tablas de seguimiento (expediente P-07).

### CPI-15 · `temperatura_fuera_rango` — Temperatura fuera de rango

Operación EJEMPLO: **360-2611-9915** (`shipment_id` 00000000-0000-4000-8000-000000009915). Fuente: SIN FUENTE hoy (sensor o proveedor futuro). Umbral: `OPS_ALERTA_TEMPERATURA_MIN=15`.


**CPI-15-P · Positivo**

- **Precondición:** Carga refrigerada EJEMPLO, rango 2–8 °C. Operación 360-2611-9915 (EJEMPLO).
- **Datos (EJEMPLO):** `{"rango_c": [2, 8], "lecturas": [{"t": "2026-11-18T13:00:00Z", "c": 9.1}, {"t": "2026-11-18T13:20:00Z", "c": 9.4}]}`
- **Pasos:** 1. Cargar lecturas. 2. Correr el evaluador.
- **Resultado esperado:** Abre `temperatura_fuera_rango` (20 min fuera ≥ 15). Alerta: **sí** · código `temperatura_fuera_rango` · severidad `alta` · avisa a: Coordinador + Jefatura de operaciones · escalamiento: 15 min → Jefatura de operaciones · aprobación humana: Sí.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: SIN FUENTE hoy (sensor o proveedor futuro).

**CPI-15-N · Negativo**

- **Precondición:** Lecturas dentro del rango. Operación 360-2611-9915 (EJEMPLO).
- **Datos (EJEMPLO):** `{"rango_c": [2, 8], "lecturas": [{"t": "2026-11-18T13:00:00Z", "c": 5.0}]}`
- **Pasos:** 1. Correr el evaluador.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `temperatura_fuera_rango`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: SIN FUENTE hoy (sensor o proveedor futuro).

**CPI-15-B · Borde**

- **Precondición:** Exactamente 15 min fuera; y una carga no refrigerada a 25 °C. Operación 360-2611-9915 (EJEMPLO).
- **Datos (EJEMPLO):** `{"rango_c": [2, 8], "lecturas": [{"t": "2026-11-18T13:00:00Z", "c": 8.5}, {"t": "2026-11-18T13:15:00Z", "c": 8.6}], "control_no_refrigerada_c": 25}`
- **Pasos:** 1. Correr el evaluador en ambos casos.
- **Resultado esperado:** Abre a los 15 min. La carga sin requisito de frío no abre nada. Alerta: **sí** · código `temperatura_fuera_rango` · severidad `alta` · avisa a: Coordinador + Jefatura de operaciones · escalamiento: 15 min → Jefatura de operaciones · aprobación humana: Sí.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: SIN FUENTE hoy (sensor o proveedor futuro).

### CPI-16 · `incidente_seguridad` — Exposición de datos o del enlace de seguimiento

Operación EJEMPLO: **360-2611-9916** (`shipment_id` 00000000-0000-4000-8000-000000009916). Fuente: Revisión de evidence_json y de la respuesta del enlace público (ops_tracking_links). Umbral: `— (regla de contenido)`.


**CPI-16-P · Positivo**

- **Precondición:** Una alerta trae un teléfono del conductor en la evidencia. Operación 360-2611-9916 (EJEMPLO).
- **Datos (EJEMPLO):** `{"evidence_json": {"nota": "llamar al +56 9 0000 0000 (EJEMPLO)"}}`
- **Pasos:** 1. Correr la revisión de contenido.
- **Resultado esperado:** Abre `incidente_seguridad` y lo escala solo a JEFE BASTIAN. El bot no borra ni edita la fila. Alerta: **sí** · código `incidente_seguridad` · severidad `alta` · avisa a: Solo JEFE BASTIAN · escalamiento: Inmediato → JEFE BASTIAN · aprobación humana: Sí (Nivel 3, seguridad).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Revisión de evidence_json y de la respuesta del enlace público (ops_tracking_links).

**CPI-16-N · Negativo**

- **Precondición:** La evidencia solo trae ids, minutos y umbrales. Operación 360-2611-9916 (EJEMPLO).
- **Datos (EJEMPLO):** `{"evidence_json": {"gpsPointId": "EJEMPLO", "minutos": 50, "umbralMin": 45}}`
- **Pasos:** 1. Correr la revisión.
- **Resultado esperado:** No abre alerta. Alerta: **no** (ninguna fila abierta de `incidente_seguridad`). Aprobación: no aplica.
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Revisión de evidence_json y de la respuesta del enlace público (ops_tracking_links).

**CPI-16-B · Borde**

- **Precondición:** La respuesta pública del enlace vuelve a traer `alerts` o `severity` (regresión del PR #55). Operación 360-2611-9916 (EJEMPLO).
- **Datos (EJEMPLO):** `{"respuesta_publica_claves": ["destination", "etaAt", "origin", "position", "stage", "token", "truckAware", "alerts"]}`
- **Pasos:** 1. Comparar las claves con la lista permitida.
- **Resultado esperado:** Abre `incidente_seguridad`. La lista permitida es la misma que fija `tests/ops-torre.test.ts`. Alerta: **sí** · código `incidente_seguridad` · severidad `alta` · avisa a: Solo JEFE BASTIAN · escalamiento: Inmediato → JEFE BASTIAN · aprobación humana: Sí (Nivel 3, seguridad).
- **Tabla/campo:** `ops_operation_alerts (migración ops_operation_alerts, propuesta aprobada para PR)`: `kind`, `severity`, `status`, `evidence_json`, `opened_at`; fuente leída: Revisión de evidence_json y de la respuesta del enlace público (ops_tracking_links).

## 4. Casos transversales

| ID | Caso | Precondición (EJEMPLO) | Pasos | Resultado esperado |
|---|---|---|---|---|
| CPI-T01 | Las incidencias nuevas no se ven en el enlace público | Envío con `rechazo_entrega` y `siniestro` abiertas (EJEMPLO 360-2611-9904 y 360-2611-9903) y enlace emitido. | Abrir `GET /api/ops/seguimiento/{token}`. | Las claves de la respuesta son exactamente `destination, etaAt, origin, position, stage, token, truckAware`; ningún `kind` aparece en el texto. Extiende la prueba de `tests/ops-torre.test.ts` (línea 343) a la tabla nueva. |
| CPI-T02 | Flag apagado | `OPS_FEATURE_ENABLED` distinto de `true` (o el flag hijo propuesto `OPS_INCIDENCIAS_ENABLED` apagado). | Llamar al evaluador y al registro manual. | 404, sin escribir filas. Mismo criterio que la ruta `/api/ops/alertas/senal`. |
| CPI-T03 | Una sola alerta abierta por envío y tipo | `retiro_no_iniciado` ya abierta en 360-2611-9909 (EJEMPLO). | Correr el evaluador dos veces con la condición vigente. | Una fila abierta; solo cambian `evidence_json` y `updated_at` (índice único parcial, como `idx_ops_alerts_open`). |
| CPI-T04 | Severidad fuera de la escala | Insertar una fila de prueba con `severity='critica'`. | Ejecutar el INSERT en una base de prueba local. | Falla el `CHECK (severity IN ('baja','media','alta'))`. |
| CPI-T05 | El bot no contacta a nadie | Cualquier incidencia con aviso sugerido (A8, B3, A4). | Revisar lo que produce el agente. | Solo hay un borrador con `requiere_aprobacion_humana=true`; no hay envío por correo, WhatsApp ni otro canal. |
| CPI-T06 | `OPS_ALERTA_ATRASO_MIN` (nueva) | Envío 360-2611-9909 (EJEMPLO) con `planned_delivery_at` 2026-11-18T16:00:00Z y ETA 16:31Z, sin fila en `ops_alert_rules`. | 1. Sin variable. 2. `OPS_ALERTA_ATRASO_MIN=45`. 3. Valor inválido `30min`. 4. Fila por envío con 20. | 1. Abre `atraso` (31 > 30) en `ops_alerts` con `severity='media'`. 2. No abre. 3. Vuelve a 30 y abre. 4. Gana la fila por envío. |
| CPI-T07 | Vínculo operación → envío → alerta | Operación `360-2611-9901` existente en `ops_operations` (EJEMPLO) y envío con `operation_id` vinculado. | Abrir cualquier incidencia del envío. | `ops_operation_alerts.operation_id = '360-2611-9901'`. Sin vínculo, la alerta igual se abre con `operation_id` NULL (no se bloquea el registro). |
| CPI-T08 | Bloqueo externo del secreto | `OPS_ALERTAS_JOB_SECRET` no definido; flag encendido en QA. | Llamar a `POST /api/ops/alertas/evaluar` y a `/senal`. | 503 en ambos y sin escribir filas. Es el estado esperado hasta que Gerencia defina el secreto. |

*Fin. Carga360go.*
