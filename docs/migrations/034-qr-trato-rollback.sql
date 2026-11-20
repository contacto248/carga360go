-- Reversa de la 034. No toca la 032 ni las tablas operativas anteriores.
-- SQLite 3.35+ permite DROP COLUMN. Las filas de trucks conservan el resto de columnas.

DROP TABLE IF EXISTS trip_idempotency;
DROP TABLE IF EXISTS trip_receipts;
DROP TABLE IF EXISTS trip_delegate_links;
DROP TABLE IF EXISTS trip_qr_nonces;
DROP TABLE IF EXISTS trip_handoff_attempts;
DROP TABLE IF EXISTS trip_handoffs;
DROP TABLE IF EXISTS trip_assignments;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS trip_deals;
ALTER TABLE trucks DROP COLUMN patente;
DELETE FROM schema_migrations WHERE version = 34;
