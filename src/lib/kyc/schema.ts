import type Database from "better-sqlite3";
import { getDb } from "../db";
import { KYC_GRACE_DAYS } from "./config";

/**
 * Migración separada del módulo KYC (mismo SQLite del sitio), con su propia tabla de versiones.
 * NO se ejecuta desde getDb(): solo la llama el código KYC, que solo corre con KYC_FEATURE_ENABLED=true
 * (o en las pruebas). Con el flag apagado la base productiva no cambia.
 * Copia legible en deploy/migrations/kyc-didit-001.sql y kyc-didit-002.sql.
 *
 * Minimización de datos (Ley 21.719): no se guardan imágenes, selfies ni la decisión completa de Didit.
 * Solo el estado, el RUN leído de la cédula (para compararlo), el nombre leído y los códigos de alerta.
 */
export const KYC_SCHEMA_V1 = `
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
`;

function version(db: Database.Database): number {
  db.exec(`CREATE TABLE IF NOT EXISTS kyc_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`);
  const row = db.prepare(`SELECT MAX(version) AS v FROM kyc_schema_migrations`).get() as { v: number | null };
  return row.v ?? 0;
}

const migrated = new WeakSet<Database.Database>();

export const KYC_SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS kyc_grace (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  expired_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kyc_grace_ends ON kyc_grace(ends_at);
`;

export function ensureKycSchema(db: Database.Database = getDb()) {
  if (migrated.has(db)) return;
  if (version(db) < 1) {
    db.transaction(() => {
      db.exec(KYC_SCHEMA_V1);
      db.prepare(`INSERT INTO kyc_schema_migrations (version, applied_at) VALUES (1, ?)`).run(new Date().toISOString());
    })();
  }
  if (version(db) < 2) {
    const stamp = new Date().toISOString();
    const ends = new Date(Date.now() + KYC_GRACE_DAYS * 86_400_000).toISOString();
    db.transaction(() => {
      db.exec(KYC_SCHEMA_V2);
      db.prepare(`INSERT INTO kyc_schema_migrations (version, applied_at) VALUES (2, ?)`).run(stamp);
      db.prepare(
        `INSERT OR IGNORE INTO kyc_grace (user_id, started_at, ends_at, expired_at, created_at)
         SELECT id, ?, ?, NULL, ? FROM users WHERE verification_status = 'verificado' AND role != 'admin'`,
      ).run(stamp, ends, stamp);
    })();
  }
  migrated.add(db);
}
