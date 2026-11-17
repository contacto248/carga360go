-- Migración 028 (src/lib/db.ts, MIGRATION_28_SQL): traza inmutable de la decisión (trace-v1).
-- Se aplica sola al arrancar el sitio (getDb), aunque los flags OPS estén apagados.
-- Solo crea una tabla, un índice y dos disparadores. No modifica users, loads, offers,
-- trucks, ni las migraciones 022 a 027. No hay llave foránea: la reversa de la 026 sigue siendo válida.
-- No inserta filas de ejemplo. Los disparadores rechazan UPDATE y DELETE.
-- Reversa: docs/migrations/028-ops-asignacion-traza-rollback.sql

CREATE TABLE IF NOT EXISTS ops_allocation_traces (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  trace_version TEXT NOT NULL CHECK (trace_version = 'trace-v1'),
  trace_json TEXT NOT NULL,
  trace_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_traces_run ON ops_allocation_traces(run_id);

CREATE TRIGGER IF NOT EXISTS ops_allocation_traces_no_update
BEFORE UPDATE ON ops_allocation_traces
BEGIN
  SELECT RAISE(ABORT, 'traza inmutable');
END;

CREATE TRIGGER IF NOT EXISTS ops_allocation_traces_no_delete
BEFORE DELETE ON ops_allocation_traces
BEGIN
  SELECT RAISE(ABORT, 'traza inmutable');
END;
