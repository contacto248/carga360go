-- Migración 023 (OPS-102): envío operativo y bitácora encadenada.
-- La aplica src/lib/db.ts (MIGRATION_23_SQL) al arrancar, si aún no está la versión 23.
-- Solo crea tablas e índices nuevos. No modifica users, loads, offers, trip_events,
-- freight_payments ni pod_evidence. No inserta filas de ejemplo.
-- El número 022 queda reservado para OPS-101 (organizaciones). Esta migración no lo usa.
-- Hash de cada evento (src/lib/ops/shipments.ts):
-- sha256( JSON.stringify([prev_hash, seq, kind, payload_json, created_at]) ).
-- Reversa: docs/migrations/023-ops-envios-rollback.sql

CREATE TABLE IF NOT EXISTS ops_shipments (
  id TEXT PRIMARY KEY,
  load_id TEXT UNIQUE REFERENCES loads(id) ON DELETE SET NULL,
  shipper_org_id TEXT,
  carrier_org_id TEXT,
  rate_card_id TEXT,
  lane_id TEXT,
  assigned_offer_id TEXT,
  stage TEXT NOT NULL CHECK (stage IN ('negociacion','asignacion','ejecucion','pod','auditoria','facturacion','pago','cerrado','cancelado')),
  planned_pickup_at TEXT,
  planned_delivery_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_shipments_stage ON ops_shipments(stage, updated_at);

CREATE TABLE IF NOT EXISTS ops_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  actor_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (shipment_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_ops_events_shipment ON ops_events(shipment_id, seq);
