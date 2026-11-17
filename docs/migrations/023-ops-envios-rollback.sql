-- Reversa de la migración 023 (OPS-102).
-- Solo borra tablas e índices que crea esa migración, y su fila en schema_migrations.
-- No toca users, loads, offers, trip_events ni la migración 022.

DROP INDEX IF EXISTS idx_ops_events_shipment;
DROP TABLE IF EXISTS ops_events;
DROP INDEX IF EXISTS idx_ops_shipments_stage;
DROP TABLE IF EXISTS ops_shipments;
DELETE FROM schema_migrations WHERE version = 23;
