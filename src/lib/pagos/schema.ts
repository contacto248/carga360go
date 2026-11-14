import type Database from "better-sqlite3";

/**
 * Migración separada del módulo de pagos (SQLite, mismo motor del sitio).
 * NO se ejecuta desde getDb(): solo la llama el código de pagos, que a su vez solo corre
 * con PAYMENTS_FEATURE_ENABLED=true (o en las pruebas). Así, con el flag apagado,
 * la base productiva no cambia. Lleva su propia tabla de versiones.
 * Copia legible en deploy/migrations/pagos-mp-001.sql.
 */
export const PAYMENTS_SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS payment_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercadopago' CHECK (provider IN ('mercadopago', 'khipu')),
  mp_user_id TEXT,
  mp_public_key TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_key_version INTEGER NOT NULL DEFAULT 1,
  scope TEXT,
  live_mode INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'renewal_failed', 'revoked')),
  tax_ready INTEGER NOT NULL DEFAULT 0,
  connected_at TEXT,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_payacc_mp_user ON payment_accounts(mp_user_id);

CREATE TABLE IF NOT EXISTS payment_oauth_states (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS freight_payments (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL, -- sin FK: el comprobante de pago se conserva aunque se borre la carga o la cuenta
  offer_id TEXT,
  shipper_user_id TEXT NOT NULL,
  trucker_user_id TEXT NOT NULL,
  payment_account_id TEXT,
  currency TEXT NOT NULL DEFAULT 'CLP',
  freight_net_amount INTEGER NOT NULL,
  freight_vat_amount INTEGER NOT NULL DEFAULT 0,
  freight_gross_amount INTEGER NOT NULL,
  anticipo_percent INTEGER NOT NULL,
  anticipo_amount INTEGER NOT NULL,
  saldo_amount INTEGER NOT NULL,
  fee_payer TEXT NOT NULL CHECK (fee_payer IN ('shipper', 'trucker')),
  fee_rate_estimate REAL NOT NULL,
  vat_rate REAL NOT NULL,
  marketplace_fee_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'adjudicada' CHECK (status IN (
    'adjudicada', 'anticipo_pagado', 'en_transito', 'entregada_POD', 'en_disputa',
    'saldo_liberado', 'cancelada', 'reembolsada', 'reembolso_parcial', 'reembolso_fallido'
  )),
  live_mode INTEGER NOT NULL DEFAULT 0,
  pod_submitted_at TEXT,
  dispute_window_ends_at TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_load_active ON freight_payments(load_id) WHERE status NOT IN ('cancelada', 'reembolsada');
CREATE INDEX IF NOT EXISTS idx_fp_shipper ON freight_payments(shipper_user_id);
CREATE INDEX IF NOT EXISTS idx_fp_trucker ON freight_payments(trucker_user_id);
CREATE INDEX IF NOT EXISTS idx_fp_status ON freight_payments(status, dispute_window_ends_at);

CREATE TABLE IF NOT EXISTS freight_payment_installments (
  id TEXT PRIMARY KEY,
  freight_payment_id TEXT NOT NULL REFERENCES freight_payments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('anticipo', 'saldo')),
  base_amount INTEGER NOT NULL,
  estimated_fee_amount INTEGER NOT NULL DEFAULT 0,
  charged_amount INTEGER NOT NULL,
  preference_id TEXT,
  init_point TEXT,
  preference_created_at TEXT,
  mp_payment_id TEXT,
  mp_status TEXT,
  mp_status_detail TEXT,
  external_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN (
    'pendiente', 'preferencia_creada', 'pendiente_mp', 'approved', 'rejected', 'refunded', 'charged_back'
  )),
  approved_at TEXT,
  refunded_at TEXT,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  fee_actual_amount INTEGER,
  updated_at TEXT NOT NULL,
  UNIQUE (freight_payment_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_fpi_extref ON freight_payment_installments(external_reference);
CREATE INDEX IF NOT EXISTS idx_fpi_mp_payment ON freight_payment_installments(mp_payment_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  freight_payment_id TEXT,
  installment_id TEXT,
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  topic TEXT NOT NULL,
  action TEXT,
  provider_event_id TEXT,
  provider_resource_id TEXT,
  payload_sanitized TEXT,
  signature_valid INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT,
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'ignored', 'applied', 'error', 'duplicate', 'rejected')),
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payev_dedupe ON payment_events(provider, topic, provider_event_id, provider_resource_id)
  WHERE provider_event_id IS NOT NULL AND signature_valid = 1;
CREATE INDEX IF NOT EXISTS idx_payev_fp ON payment_events(freight_payment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payev_time ON payment_events(created_at);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  freight_payment_id TEXT NOT NULL REFERENCES freight_payments(id) ON DELETE CASCADE,
  opened_by_user_id TEXT,
  reason TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN (
    'abierta', 'en_mediacion', 'resuelta_liberar', 'resuelta_reembolso', 'resuelta_parcial', 'cerrada'
  )),
  resolution_note TEXT,
  refund_amount INTEGER,
  opened_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_disputes_fp ON disputes(freight_payment_id, status);

CREATE TABLE IF NOT EXISTS pod_evidence (
  id TEXT PRIMARY KEY,
  freight_payment_id TEXT NOT NULL REFERENCES freight_payments(id) ON DELETE CASCADE,
  uploaded_by_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('foto_documento', 'firma', 'otro', 'gps', 'otp')),
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pod_fp ON pod_evidence(freight_payment_id);
`;

const ensured = new WeakSet<Database.Database>();

export function ensurePaymentsSchema(db: Database.Database) {
  if (ensured.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS payments_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`);
  const row = db.prepare(`SELECT MAX(version) AS v FROM payments_schema_migrations`).get() as { v: number | null };
  if ((row.v ?? 0) < 1) {
    db.transaction(() => {
      db.exec(PAYMENTS_SCHEMA_V1);
      db.prepare(`INSERT INTO payments_schema_migrations (version, applied_at) VALUES (1, ?)`).run(new Date().toISOString());
    })();
  }
  ensured.add(db);
}
