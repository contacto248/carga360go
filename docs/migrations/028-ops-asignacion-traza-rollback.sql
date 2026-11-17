-- Reversa de la migración 028. Borra solo la traza y su fila en schema_migrations.
-- No toca 022, 023, 024, 025, 026, 027 ni las tablas previas.
DROP TRIGGER IF EXISTS ops_allocation_traces_no_delete;
DROP TRIGGER IF EXISTS ops_allocation_traces_no_update;
DROP INDEX IF EXISTS idx_ops_allocation_traces_run;
DROP TABLE IF EXISTS ops_allocation_traces;
DELETE FROM schema_migrations WHERE version = 28;
