-- Reversa de la migración 033. No toca agent_* ni ops_*.

DROP INDEX IF EXISTS idx_load_suggestions_kind;
DROP INDEX IF EXISTS idx_load_suggestions_load;
DROP TABLE IF EXISTS load_suggestions;
DELETE FROM schema_migrations WHERE version = 33;

