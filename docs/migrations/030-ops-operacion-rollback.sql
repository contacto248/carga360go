-- Reversa de la migración 030 (alta de operación).
-- Solo borra tablas e índices que crea esa migración, y su fila en schema_migrations.
-- No toca las migraciones 022–029.

DROP INDEX IF EXISTS idx_ops_operations_created;
DROP TABLE IF EXISTS ops_operation_keys;
DROP TABLE IF EXISTS ops_operations;
DROP TABLE IF EXISTS ops_operation_counters;
DELETE FROM schema_migrations WHERE version = 30;
