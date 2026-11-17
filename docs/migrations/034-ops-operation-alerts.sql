-- Migración 034 (ops_operation_alerts): alertas de operación (incidencias) y vínculo envío → operación.
-- La aplica src/lib/db.ts (MIGRATION_34_SQL y MIGRATION_34_COLUMN_SQL) al arrancar, si aún no está la versión 34.
-- 034 es el siguiente número libre: 030, 031 y 032 están ocupadas y la 033 la usa feat/tracking-token-hash.
-- Aditiva: una tabla nueva con sus índices y una columna nullable en ops_shipments.
-- No modifica ops_alerts, ops_alert_rules, ops_geofences, ops_tracking_links, ops_operations,
-- users, loads, offers, trip_events, trip_gps_points ni las migraciones 022 a 032. No inserta filas de ejemplo.
-- Los kinds atraso, detencion y sin_senal se siguen escribiendo solo en ops_alerts (029/031).
-- El enlace público (/seguimiento/{token}) no lee esta tabla.
-- ops_shipments.operation_id no declara REFERENCES para que la reversa pueda usar DROP COLUMN;
-- la existencia en ops_operations la valida src/lib/ops/shipments.ts.
-- Reversa: docs/migrations/034-ops-operation-alerts-rollback.sql

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
