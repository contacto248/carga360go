-- Migración 025 (src/lib/db.ts, MIGRATION_25_SQL): puntaje de desempeño del transportista.
-- Se aplica sola al arrancar el sitio (getDb), aunque los flags OPS estén apagados.
-- Solo crea tablas e índices nuevos. No modifica users, loads, offers, trip_events,
-- freight_payments, pod_evidence, ni las migraciones 022, 023 o 024.
-- No inserta filas de ejemplo.
-- Reversa: docs/migrations/025-ops-desempeno-rollback.sql

CREATE TABLE IF NOT EXISTS ops_carrier_scores (
  id TEXT PRIMARY KEY,
  carrier_user_id TEXT NOT NULL,
  carrier_org_id TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  trips_done INTEGER NOT NULL,
  on_time_pct REAL,
  cancel_count INTEGER NOT NULL,
  incident_count INTEGER NOT NULL,
  avg_rating REAL,
  docs_valid INTEGER,
  score REAL NOT NULL,
  level TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE (carrier_user_id, period_end, rules_version)
);

CREATE INDEX IF NOT EXISTS idx_ops_carrier_scores_carrier ON ops_carrier_scores(carrier_user_id, period_end);

CREATE TABLE IF NOT EXISTS ops_score_events (
  id TEXT PRIMARY KEY,
  carrier_user_id TEXT NOT NULL,
  load_id TEXT,
  rule_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_score_events_carrier ON ops_score_events(carrier_user_id, created_at);
