-- Migración del módulo KYC (Didit). NO aplicada en producción.
-- La aplica el propio código (src/lib/kyc/schema.ts) solo con KYC_FEATURE_ENABLED=true.
-- Versión propia en la tabla kyc_schema_migrations (no usa schema_migrations del sitio).

CREATE TABLE IF NOT EXISTS kyc_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'no_iniciado'
    CHECK (status IN ('no_iniciado', 'en_curso', 'en_revision', 'aprobado', 'rechazado', 'expirado')),
  provider TEXT NOT NULL DEFAULT 'didit',
  session_id TEXT,
  provider_status TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  consent_version TEXT,
  document_run TEXT,
  document_name TEXT,
  run_matches_account INTEGER,
  warnings TEXT,
  last_event_at INTEGER,
  decided_at TEXT,
  decided_by TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_verifications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_session ON kyc_verifications(session_id);

CREATE TABLE IF NOT EXISTS kyc_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_user ON kyc_sessions(user_id);

CREATE TABLE IF NOT EXISTS kyc_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  webhook_type TEXT NOT NULL,
  provider_status TEXT,
  environment TEXT,
  event_created_at INTEGER,
  outcome TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kyc_events_session ON kyc_events(session_id);
