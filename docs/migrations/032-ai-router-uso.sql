-- Migración 032: uso del orquestador interno.
-- La aplica src/lib/db.ts (MIGRATION_32_SQL) si aún no está la versión 32.
-- Solo crea una tabla, un índice y dos disparadores. No modifica ops_alerts
-- ni las migraciones 022 a 031. La 030 y la 031 siguen ocupadas por operación y severidad.
-- Reversa: docs/migrations/032-ai-router-uso-rollback.sql

CREATE TABLE IF NOT EXISTS ai_router_usage (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'xai')),
  model TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'openai', 'xai', 'both')),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  fallback_used INTEGER NOT NULL CHECK (fallback_used IN (0, 1)),
  result TEXT NOT NULL CHECK (result IN ('ok', 'error')),
  error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_router_usage_trace ON ai_router_usage(trace_id);

CREATE TRIGGER IF NOT EXISTS ai_router_usage_no_update
BEFORE UPDATE ON ai_router_usage
BEGIN
  SELECT RAISE(ABORT, 'uso inmutable');
END;

CREATE TRIGGER IF NOT EXISTS ai_router_usage_no_delete
BEFORE DELETE ON ai_router_usage
BEGIN
  SELECT RAISE(ABORT, 'uso inmutable');
END;
