-- Reversa de la migración 029 (OPS-302, OPS-303 y OPS-304).
-- Solo borra tablas e índices que crea esa migración, y su fila en schema_migrations.
-- No toca trip_gps_points ni las migraciones 022–028.

DROP INDEX IF EXISTS idx_ops_alerts_open;
DROP INDEX IF EXISTS idx_ops_alerts_shipment;
DROP TABLE IF EXISTS ops_alerts;
DROP INDEX IF EXISTS idx_ops_alert_rules_shipment;
DROP TABLE IF EXISTS ops_alert_rules;
DROP INDEX IF EXISTS idx_ops_eta_shipment;
DROP TABLE IF EXISTS ops_eta_snapshots;
DROP INDEX IF EXISTS idx_ops_geofences_shipment;
DROP TABLE IF EXISTS ops_geofences;
DROP TABLE IF EXISTS ops_tracking_links;
DELETE FROM schema_migrations WHERE version = 29;
