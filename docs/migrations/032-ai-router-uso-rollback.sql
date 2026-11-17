-- Reversa de la migración 032. No toca ops_alerts ni las migraciones 022 a 031.

DROP TRIGGER IF EXISTS ai_router_usage_no_delete;
DROP TRIGGER IF EXISTS ai_router_usage_no_update;
DROP INDEX IF EXISTS idx_ai_router_usage_trace;
DROP TABLE IF EXISTS ai_router_usage;
DELETE FROM schema_migrations WHERE version = 32;
