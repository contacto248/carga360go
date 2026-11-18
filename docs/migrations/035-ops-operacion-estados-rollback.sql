-- Reversa de la migración 035 (estados v1.1 de la operación).
-- Devuelve el CHECK de un solo estado y mapea abierta → planificada.
-- Si queda una fila en otro estado, el CHECK aborta y no borra la tabla vigente.
-- No borra ops_operation_keys ni ops_operation_counters. No toca la 033 ni la 034.
-- Aplicar con las claves foráneas apagadas y dentro de una transacción.

DROP TABLE IF EXISTS ops_operations_planificada;
CREATE TABLE ops_operations_planificada (
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
INSERT INTO ops_operations_planificada (
  id, cliente, origen, destino, tipo_carga, peso_kg, estado, version, created_by, created_at, updated_at
)
SELECT
  id, cliente, origen, destino, tipo_carga, peso_kg,
  CASE estado WHEN 'abierta' THEN 'planificada' ELSE estado END,
  version, created_by, created_at, updated_at
FROM ops_operations;
DROP INDEX IF EXISTS idx_ops_operations_created;
DROP TABLE ops_operations;
ALTER TABLE ops_operations_planificada RENAME TO ops_operations;
CREATE INDEX IF NOT EXISTS idx_ops_operations_created ON ops_operations(created_at);
DELETE FROM schema_migrations WHERE version = 35;
