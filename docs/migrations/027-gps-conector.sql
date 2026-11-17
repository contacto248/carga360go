-- Migración 27 (OPS-301). Copia de src/lib/ops/gps/schema.ts.
-- Solo crea tablas nuevas. No altera trip_gps_points ni inserta filas.
-- credential_ref queda vacío: no se guardan tokens ni claves.

CREATE TABLE IF NOT EXISTS ops_telematics_sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('simulado', 'conductor')),
  label TEXT NOT NULL,
  credential_ref TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_telematics_provider ON ops_telematics_sources(provider);

CREATE TABLE IF NOT EXISTS ops_gps_receipts (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES ops_telematics_sources(id),
  load_id TEXT NOT NULL,
  gps_point_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_gps_receipts_load ON ops_gps_receipts(load_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_gps_receipts_point ON ops_gps_receipts(gps_point_id);
