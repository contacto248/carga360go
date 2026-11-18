-- Reversa de la migración 034, ops_operation_alerts (alertas de operación y vínculo envío → operación).
-- Quita solo ops_operation_alerts con sus índices, la columna ops_shipments.operation_id con su índice,
-- y la fila 34 de schema_migrations. No toca ops_alerts ni las migraciones 022 a 032.
-- Antes de correrla: respaldo de la base (los vínculos y las incidencias se pierden).

DROP INDEX IF EXISTS idx_ops_shipments_operation;
ALTER TABLE ops_shipments DROP COLUMN operation_id;
DROP INDEX IF EXISTS idx_ops_operation_alerts_open;
DROP INDEX IF EXISTS idx_ops_operation_alerts_kind;
DROP INDEX IF EXISTS idx_ops_operation_alerts_operation;
DROP INDEX IF EXISTS idx_ops_operation_alerts_shipment;
DROP TABLE IF EXISTS ops_operation_alerts;
DELETE FROM schema_migrations WHERE version = 34;
