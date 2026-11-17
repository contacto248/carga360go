-- Reversa de la migración 022. Borra solo las tablas e índices que ella crea
-- y su fila en schema_migrations. No toca users, loads, offers, trip_events,
-- freight_payments ni pod_evidence.
DROP INDEX IF EXISTS idx_ops_org_members_user;
DROP INDEX IF EXISTS idx_ops_org_members_org;
DROP TABLE IF EXISTS ops_org_members;
DROP TABLE IF EXISTS ops_organizations;
DELETE FROM schema_migrations WHERE version = 22;
