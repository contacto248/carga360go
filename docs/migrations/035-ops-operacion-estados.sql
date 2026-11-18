-- Migración 035: estados v1.1 de la operación.
-- La 033 es el hash del token y la 034 las alertas de operación. Esta no las usa.
-- La aplica src/lib/db.ts (MIGRATION_35_SQL) con las claves foráneas apagadas,
-- igual que la 018, porque ops_operation_keys apunta a ops_operations.
-- Reconstruye el CHECK de un solo estado. planificada pasa a abierta.
-- No crea ops_operation_seq: el correlativo sigue en ops_operation_counters.
-- No cambia el tope 9999 ni el formato 360-YYMM-NNNN. Eso lo aplica el código.
-- No toca users, loads, offers, pagos ni las migraciones 022 a 032.
-- Reversa: docs/migrations/035-ops-operacion-estados-rollback.sql

DROP TABLE IF EXISTS ops_operations_v35;
CREATE TABLE ops_operations_v35 (
  id TEXT PRIMARY KEY,
  cliente TEXT NOT NULL,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  tipo_carga TEXT NOT NULL,
  peso_kg REAL NOT NULL CHECK (peso_kg > 0),
  estado TEXT NOT NULL CHECK (estado IN (
    'abierta',
    'documentacion_pendiente',
    'en_asignacion',
    'asignada',
    'en_curso',
    'entregada',
    'cerrada',
    'cancelada'
  )),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO ops_operations_v35 (
  id, cliente, origen, destino, tipo_carga, peso_kg, estado, version, created_by, created_at, updated_at
)
SELECT
  id, cliente, origen, destino, tipo_carga, peso_kg,
  CASE estado WHEN 'planificada' THEN 'abierta' ELSE estado END,
  version, created_by, created_at, updated_at
FROM ops_operations;
DROP INDEX IF EXISTS idx_ops_operations_created;
DROP TABLE ops_operations;
ALTER TABLE ops_operations_v35 RENAME TO ops_operations;
CREATE INDEX IF NOT EXISTS idx_ops_operations_created ON ops_operations(created_at);
