-- Reversa de la migración 031 (severidad de alertas).
-- Quita solo la columna severity y la fila 31 de schema_migrations.
-- No borra ops_alerts ni toca las migraciones 022 a 030.

ALTER TABLE ops_alerts DROP COLUMN severity;
DELETE FROM schema_migrations WHERE version = 31;
