-- Migración 034: trato con QR de retiro (QR-02 a QR-06, fase 1).
-- La 033 no se usa. La 032 (uso del orquestador) queda intacta.
-- Solo agrega una columna nula y tablas nuevas. No reescribe filas existentes.
-- La patente, si ya está en trucks.specs_json o en documents.holder_name, la reutiliza el código.
-- Reversa: docs/migrations/034-qr-trato-rollback.sql

ALTER TABLE trucks ADD COLUMN patente TEXT;

CREATE TABLE IF NOT EXISTS trip_deals (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL UNIQUE REFERENCES loads(id),
  offer_id TEXT NOT NULL REFERENCES offers(id),
  public_ref TEXT NOT NULL UNIQUE,
  folio TEXT UNIQUE,
  terms_json TEXT,
  terms_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('pendiente_confirmacion', 'cerrado', 'anulado', 'expirado')),
  accepted_by TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  confirm_deadline TEXT NOT NULL,
  confirm_code_hash TEXT,
  confirm_attempts INTEGER NOT NULL DEFAULT 0,
  confirm_code_expires TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  carrier_id TEXT NOT NULL REFERENCES users(id),
  user_id TEXT REFERENCES users(id),
  display_name TEXT NOT NULL,
  photo_path TEXT,
  license_class TEXT,
  license_expiry TEXT,
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'verificado', 'suspendido')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drivers_carrier ON drivers(carrier_id);

CREATE TABLE IF NOT EXISTS trip_assignments (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL REFERENCES loads(id),
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  truck_id TEXT NOT NULL REFERENCES trucks(id),
  patente_snapshot TEXT NOT NULL,
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  status TEXT NOT NULL CHECK (status IN ('vigente', 'reemplazada')),
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  replaced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_trip_assignments_load ON trip_assignments(load_id, status);

CREATE TABLE IF NOT EXISTS trip_handoffs (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL REFERENCES loads(id),
  kind TEXT NOT NULL CHECK (kind IN ('retiro', 'entrega')),
  key_id TEXT NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'escaneado', 'confirmado', 'rechazado')),
  holder_user_id TEXT,
  validated_at TEXT,
  validated_by TEXT,
  method TEXT CHECK (method IN ('qr', 'codigo', 'manual_admin')),
  holder_confirmed_at TEXT,
  sync_state TEXT NOT NULL DEFAULT 'en_linea' CHECK (sync_state IN ('en_linea', 'pendiente_sync', 'sincronizado', 'rechazado')),
  locked_until TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (load_id, kind)
);

CREATE TABLE IF NOT EXISTS trip_handoff_attempts (
  id TEXT PRIMARY KEY,
  handoff_id TEXT NOT NULL REFERENCES trip_handoffs(id),
  actor_id TEXT,
  device_id TEXT,
  method TEXT NOT NULL,
  nonce TEXT,
  result TEXT NOT NULL CHECK (result IN (
    'ok', 'firma_invalida', 'vencido', 'ya_usado', 'chofer_no_asignado', 'patente_distinta',
    'fuera_de_geocerca', 'limite_intentos', 'estado_invalido', 'codigo_invalido', 'mal_formado'
  )),
  lat REAL,
  lng REAL,
  accuracy_m REAL,
  geofence_ok INTEGER,
  device_time TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trip_attempts_handoff ON trip_handoff_attempts(handoff_id, created_at);

CREATE TABLE IF NOT EXISTS trip_qr_nonces (
  handoff_id TEXT NOT NULL REFERENCES trip_handoffs(id),
  nonce TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (handoff_id, nonce)
);

CREATE TABLE IF NOT EXISTS trip_delegate_links (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL REFERENCES loads(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_receipts (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL REFERENCES loads(id),
  version INTEGER NOT NULL,
  pdf_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (load_id, version)
);

CREATE TABLE IF NOT EXISTS trip_idempotency (
  idempotency_key TEXT NOT NULL,
  load_id TEXT NOT NULL,
  action TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (idempotency_key, load_id, action)
);
