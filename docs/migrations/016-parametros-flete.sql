-- Migración 16. La aplica src/lib/db.ts al arrancar.
-- Lleva a tablas el cálculo de /api/estimacion: tarifa por km por equipo,
-- factor de ruta y mínimo por viaje. Cada alta de semilla y cada cambio
-- queda en freight_param_audit (quién, cuándo, valor anterior y nuevo).
-- La semilla son los valores que ya usaba el código. INSERT OR IGNORE no pisa un cambio posterior.
-- Idempotente.

CREATE TABLE IF NOT EXISTS freight_cost_settings (
  key TEXT PRIMARY KEY CHECK (key IN ('road_factor', 'min_trip_liviano', 'min_trip_pesado')),
  value_real REAL NOT NULL CHECK (value_real > 0),
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS freight_km_rates (
  equipment TEXT PRIMARY KEY,
  rate_min INTEGER NOT NULL CHECK (rate_min > 0),
  rate_max INTEGER NOT NULL CHECK (rate_max >= rate_min),
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS freight_param_audit (
  id TEXT PRIMARY KEY,
  param_key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_freight_param_audit_time ON freight_param_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_freight_param_audit_key ON freight_param_audit(param_key, created_at);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (16, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
