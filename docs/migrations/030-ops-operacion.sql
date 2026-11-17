-- Migración 030: alta de operación.
-- La aplica src/lib/db.ts (MIGRATION_30_SQL) al arrancar, si aún no está la versión 30.
-- Solo crea tablas e índices nuevos. No modifica users, loads, offers, trip_events
-- ni las tablas de las migraciones 022 a 029. No inserta filas de ejemplo.
-- El identificador público es 360-YYMM-NNNN (UTC). Lo asigna el servidor.
-- La clave de idempotencia vive en ops_operation_keys. El mismo cuerpo repite la operación;
-- un cuerpo distinto con la misma clave se rechaza.
-- Reversa: docs/migrations/030-ops-operacion-rollback.sql

CREATE TABLE IF NOT EXISTS ops_operations (
  id TEXT PRIMARY KEY,
  cliente TEXT NOT NULL,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  tipo_carga TEXT NOT NULL,
  peso_kg REAL NOT NULL CHECK (peso_kg > 0),
  estado TEXT NOT NULL CHECK (estado = 'planificada'),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_operations_created ON ops_operations(created_at);

CREATE TABLE IF NOT EXISTS ops_operation_keys (
  idempotency_key TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES ops_operations(id),
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_operation_counters (
  periodo TEXT PRIMARY KEY,
  ultimo INTEGER NOT NULL CHECK (ultimo >= 1)
);
