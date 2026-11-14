-- Plazo de gracia de 15 días para cuentas que ya estaban acreditadas al encender el KYC.
-- La aplica src/lib/kyc/schema.ts (versión 2) solo con KYC_FEATURE_ENABLED=true.
-- En el mismo paso se incluye a las cuentas verification_status = 'verificado' (no administradoras).

CREATE TABLE IF NOT EXISTS kyc_grace (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  expired_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kyc_grace_ends ON kyc_grace(ends_at);
