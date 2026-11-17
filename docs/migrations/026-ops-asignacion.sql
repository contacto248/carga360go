-- Migración 026 (src/lib/db.ts, MIGRATION_26_SQL): motor de asignación en modo propuesta.
-- Se aplica sola al arrancar el sitio (getDb), aunque los flags OPS estén apagados.
-- Solo crea tablas e índices nuevos. No modifica users, loads, offers, trip_events,
-- freight_payments, pod_evidence, ni las migraciones 022, 023, 024, 025 o 027.
-- No inserta filas de ejemplo. No adjudica cargas.
-- Reversa: docs/migrations/026-ops-asignacion-rollback.sql

CREATE TABLE IF NOT EXISTS ops_allocation_rules (
  id TEXT PRIMARY KEY,
  shipper_org_id TEXT NOT NULL,
  lane_id TEXT,
  equipment TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('directa', 'por_tarifa', 'por_desempeno', 'cascada')),
  weights_json TEXT NOT NULL,
  min_score REAL,
  accept_timeout_minutes INTEGER NOT NULL,
  max_rounds INTEGER NOT NULL,
  active INTEGER NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_rules_org ON ops_allocation_rules(shipper_org_id, active);

CREATE TABLE IF NOT EXISTS ops_allocation_runs (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL,
  rule_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('propuesta', 'en_cascada', 'confirmada', 'agotada', 'cancelada')),
  dry_run INTEGER NOT NULL DEFAULT 1,
  started_by TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_runs_shipment ON ops_allocation_runs(shipment_id, created_at);

CREATE TABLE IF NOT EXISTS ops_allocation_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ops_allocation_runs(id) ON DELETE CASCADE,
  carrier_user_id TEXT NOT NULL,
  truck_id TEXT,
  rank INTEGER NOT NULL,
  rate_clp INTEGER,
  score REAL,
  match_score REAL,
  availability TEXT,
  reasons_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('propuesto', 'invitado', 'acepto', 'rechazo', 'vencido', 'descartado')),
  attempt INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  responded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_candidates_run ON ops_allocation_candidates(run_id, rank);

CREATE TABLE IF NOT EXISTS ops_allocation_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ops_allocation_runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  step TEXT NOT NULL,
  rule_id TEXT,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_decisions_run ON ops_allocation_decisions(run_id, seq);

CREATE TABLE IF NOT EXISTS ops_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'en_curso', 'hecho', 'error', 'cancelado')),
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  run_after TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_jobs_due ON ops_jobs(status, run_after);
CREATE INDEX IF NOT EXISTS idx_ops_jobs_ref ON ops_jobs(kind, ref_id);
