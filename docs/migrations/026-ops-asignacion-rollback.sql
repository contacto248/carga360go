-- Reversa de la migración 026. Borra solo las tablas e índices que ella crea
-- y su fila en schema_migrations. No toca 022, 023, 024, 025, 027 ni las tablas previas.
DROP INDEX IF EXISTS idx_ops_jobs_ref;
DROP INDEX IF EXISTS idx_ops_jobs_due;
DROP INDEX IF EXISTS idx_ops_allocation_decisions_run;
DROP INDEX IF EXISTS idx_ops_allocation_candidates_run;
DROP INDEX IF EXISTS idx_ops_allocation_runs_shipment;
DROP INDEX IF EXISTS idx_ops_allocation_rules_org;
DROP TABLE IF EXISTS ops_jobs;
DROP TABLE IF EXISTS ops_allocation_decisions;
DROP TABLE IF EXISTS ops_allocation_candidates;
DROP TABLE IF EXISTS ops_allocation_runs;
DROP TABLE IF EXISTS ops_allocation_rules;
DELETE FROM schema_migrations WHERE version = 26;
