-- Migración 035: documentos de conductor y vehículo, y el kind aviso_vencimiento.
-- La aplica src/lib/db.ts (MIGRATION_35_SQL) si aún no está la versión 35.
-- 033 la usa el PR #66 (tracking-token-hash). 034 la usa el PR #68 (ops-operation-alerts).
-- Esta es la 035, el siguiente número libre.
--
-- Kind nuevo de ops_alerts: aviso_vencimiento (avisos a 30, 15 y 7 días). Uno solo.
-- El CHECK de release solo admite atraso, detencion y sin_senal.
-- El PR #68 no amplía ese CHECK: crea ops_operation_alerts con otros kinds
-- (documento_vencido, documento_faltante y el resto del catálogo). Este kind no se escribe ahí.
-- Como el CHECK de release aún no lo permite, esta migración lo extiende de forma aditiva
-- y conserva atraso, detencion y sin_senal. No toca ops_alert_rules ni ops_operation_alerts.
-- No modifica users, loads, offers, trip_events ni las migraciones 022 a 032.
-- documentos_faena queda vacía: no se insertan requisitos por faena.
-- Reversa: docs/migrations/035-documentos-vencimiento-rollback.sql

CREATE TABLE IF NOT EXISTS documentos_vencimiento (
  id TEXT PRIMARY KEY,
  sujeto TEXT NOT NULL CHECK (sujeto IN ('conductor', 'vehiculo')),
  sujeto_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  numero TEXT,
  vence_el TEXT NOT NULL CHECK (vence_el GLOB '????-??-??'),
  verificacion TEXT NOT NULL CHECK (verificacion IN ('pendiente', 'verificado', 'rechazado')),
  verificado_por TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (sujeto = 'conductor' AND tipo IN ('licencia', 'curso_seguridad'))
    OR (sujeto = 'vehiculo' AND tipo IN ('revision_tecnica', 'seguro', 'permiso_circulacion', 'soap'))
  ),
  CHECK (verificacion <> 'verificado' OR verificado_por IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_documentos_vencimiento_sujeto ON documentos_vencimiento(sujeto, sujeto_id);

CREATE TABLE IF NOT EXISTS documentos_faena (
  faena TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('licencia', 'curso_seguridad', 'revision_tecnica', 'seguro', 'permiso_circulacion', 'soap')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (faena, tipo)
);

DROP TABLE IF EXISTS ops_alerts_docs035;
CREATE TABLE ops_alerts_docs035 (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('atraso', 'detencion', 'sin_senal', 'aviso_vencimiento')),
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
