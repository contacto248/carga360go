-- Reversa de la migración 035 (documentos de conductor y vehículo, kind aviso_vencimiento).
-- Borra los avisos de ese kind: el CHECK anterior no los admite.
-- Conserva atraso, detencion y sin_senal, y la columna severity.
-- No toca users, loads, offers, ops_alert_rules ni las migraciones 022 a 032.

DELETE FROM ops_alerts WHERE kind = 'aviso_vencimiento';

DROP TABLE IF EXISTS ops_alerts_docs035;
CREATE TABLE ops_alerts_docs035 (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('atraso', 'detencion', 'sin_senal')),
  status TEXT NOT NULL CHECK (status IN ('abierta', 'cerrada')),
  evidence_json TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('baja', 'media', 'alta'))
);
INSERT INTO ops_alerts_docs035 (id, shipment_id, kind, status, evidence_json, opened_at, updated_at, severity)
SELECT id, shipment_id, kind, status, evidence_json, opened_at, updated_at, severity FROM ops_alerts;
DROP TABLE ops_alerts;
ALTER TABLE ops_alerts_docs035 RENAME TO ops_alerts;
CREATE INDEX IF NOT EXISTS idx_ops_alerts_shipment ON ops_alerts(shipment_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_alerts_open ON ops_alerts(shipment_id, kind) WHERE status = 'abierta';

DROP INDEX IF EXISTS idx_documentos_vencimiento_sujeto;
DROP TABLE IF EXISTS documentos_vencimiento;
DROP TABLE IF EXISTS documentos_faena;
DELETE FROM schema_migrations WHERE version = 35;
