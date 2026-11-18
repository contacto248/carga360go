-- Migración 033. La aplica src/lib/db.ts al arrancar.
-- Sugerencias al publicar una carga: camión compatible o corredor de retorno.
-- No guarda precios ni el teléfono del transportista. No toca agent_* ni ops_*.
-- Idempotente.

CREATE TABLE IF NOT EXISTS load_suggestions (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  truck_id TEXT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  carrier_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('compatible', 'retorno')),
  score INTEGER NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  notified_at TEXT,
  UNIQUE (load_id, truck_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_load_suggestions_load ON load_suggestions(load_id, kind);
CREATE INDEX IF NOT EXISTS idx_load_suggestions_kind ON load_suggestions(kind, created_at);

