/**
 * Migración 27 (OPS-301). Solo tablas nuevas.
 * No toca trip_gps_points: esa tabla ya existe y la sigue creando el módulo de viaje.
 * credential_ref es una referencia opaca; este módulo no escribe secretos ni tokens.
 * Copia: docs/migrations/027-gps-conector.sql. Reversa: docs/migrations/027-gps-conector-rollback.sql.
 */
export const MIGRATION_27_SQL = `
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
`;
