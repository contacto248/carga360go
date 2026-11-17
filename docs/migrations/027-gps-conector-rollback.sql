-- Reversa de la migración 27 (OPS-301).
-- Borra solo lo que esa migración crea. No toca los puntos de viaje ni el resto del esquema.

DROP INDEX IF EXISTS idx_ops_gps_receipts_point;
DROP INDEX IF EXISTS idx_ops_gps_receipts_load;
DROP TABLE IF EXISTS ops_gps_receipts;
DROP INDEX IF EXISTS idx_ops_telematics_provider;
DROP TABLE IF EXISTS ops_telematics_sources;
DELETE FROM schema_migrations WHERE version = 27;
