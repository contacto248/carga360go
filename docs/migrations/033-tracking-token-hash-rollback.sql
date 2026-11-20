-- Reversa de la migración 033 (hash del enlace de seguimiento).
-- Quita el índice, la columna token_hash y la fila 33 de schema_migrations.
-- La columna token queda con el hash: el token en claro no se puede reconstruir.
-- detail de la auditoría queda con el prefijo: el token completo no vuelve.
-- No borra ops_tracking_links ni filas de audit_log, ni toca las migraciones 022 a 032.

DROP INDEX IF EXISTS idx_ops_tracking_links_token_hash;
ALTER TABLE ops_tracking_links DROP COLUMN token_hash;
DELETE FROM schema_migrations WHERE version = 33;
