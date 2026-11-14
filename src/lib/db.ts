import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { addDaysIso, FREE_DAYS, freeUntilFrom } from "./campaign";
import { todayChile } from "./format";

export const schemaV1 = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('transportista', 'mandante', 'admin')),
  razon_social TEXT NOT NULL,
  rut TEXT NOT NULL,
  rut_norm TEXT NOT NULL UNIQUE,
  contact_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  city TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (verification_status IN ('pendiente', 'verificado', 'rechazado')),
  verification_note TEXT,
  login_failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE loads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  equipment TEXT NOT NULL,
  description TEXT NOT NULL,
  weight_t REAL NOT NULL,
  specs_json TEXT NOT NULL DEFAULT '{}',
  budget_clp INTEGER,
  notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trucks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  available_from TEXT NOT NULL,
  available_to TEXT NOT NULL,
  equipment TEXT NOT NULL,
  tonnage REAL NOT NULL,
  specs_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  truck_id TEXT REFERENCES trucks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  expiry TEXT NOT NULL,
  file_name TEXT,
  stored_path TEXT,
  mime TEXT,
  size_bytes INTEGER,
  verification_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (verification_status IN ('pendiente', 'verificado', 'rechazado')),
  verification_note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_resets_user ON password_resets(user_id);
CREATE INDEX idx_loads_owner ON loads(owner_id);
CREATE INDEX idx_loads_equipment ON loads(equipment);
CREATE INDEX idx_trucks_owner ON trucks(owner_id);
CREATE INDEX idx_trucks_equipment ON trucks(equipment);
CREATE INDEX idx_documents_user ON documents(user_id);
`;

/** Migración 14: columnas nuevas de users (todas TEXT y nulas). */
export const MIGRATION_14_USER_COLUMNS = [
  "backup_contact",
  "backup_contact_type",
  "backup_contact_at",
  "manual_readonly_until",
  "manual_readonly_at",
  "manual_readonly_by",
  "manual_readonly_by_email",
] as const;

let database: Database.Database | null = null;

export function databasePath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "carga360go.sqlite");
}

export function getDb(): Database.Database {
  if (database) return database;
  const file = databasePath();
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  migrate(db);
  database = db;
  return db;
}

function schemaVersion(db: Database.Database): number {
  const row = db.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as { v: number | null };
  return row.v ?? 0;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

function migrate(db: Database.Database) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );`,
  );
  if (schemaVersion(db) < 1) {
    const apply = db.transaction(() => {
      db.exec(schemaV1);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 2) {
    const apply = db.transaction(() => {
      if (!hasColumn(db, "loads", "solo_verificados")) {
        db.exec(`ALTER TABLE loads ADD COLUMN solo_verificados INTEGER NOT NULL DEFAULT 0`);
      }
      if (!hasColumn(db, "documents", "audience")) {
        db.exec(`ALTER TABLE documents ADD COLUMN audience TEXT NOT NULL DEFAULT 'personal'`);
      }
      if (!hasColumn(db, "documents", "detail")) {
        db.exec(`ALTER TABLE documents ADD COLUMN detail TEXT`);
      }
      if (!hasColumn(db, "documents", "holder_name")) {
        db.exec(`ALTER TABLE documents ADD COLUMN holder_name TEXT`);
      }
      db.exec(
        `UPDATE documents SET audience = 'camion'
         WHERE type IN ('padron', 'revision', 'permiso', 'soap', 'seguro_carga', 'gases')`,
      );
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 3) {
    const apply = db.transaction(() => {
      for (const column of ["email_verified_at", "phone_verified_at", "verified_at", "verified_by"]) {
        if (!hasColumn(db, "users", column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
      }
      db.exec(
        `CREATE TABLE IF NOT EXISTS verification_codes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          channel TEXT NOT NULL CHECK (channel IN ('email', 'phone')),
          code_hash TEXT NOT NULL,
          target TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          consumed_at TEXT,
          delivery TEXT NOT NULL DEFAULT 'pendiente',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_vcodes_user ON verification_codes(user_id, channel);`,
      );
      // Transportistas ya verificados se mantienen solo si tienen documentos aprobados; si no, vuelven a revisión.
      db.exec(
        `UPDATE users SET verification_status = 'pendiente'
         WHERE role = 'transportista' AND verification_status = 'verificado'
           AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.user_id = users.id AND d.verification_status = 'verificado')`,
      );
      db.exec(
        `UPDATE users SET verified_at = COALESCE(verified_at, created_at)
         WHERE verification_status = 'verificado'`,
      );
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 4) {
    const apply = db.transaction(() => {
      if (!hasColumn(db, "users", "alerts_opt_out")) db.exec(`ALTER TABLE users ADD COLUMN alerts_opt_out INTEGER NOT NULL DEFAULT 0`);
      if (!hasColumn(db, "users", "alert_token")) db.exec(`ALTER TABLE users ADD COLUMN alert_token TEXT`);
      db.exec(
        `CREATE TABLE IF NOT EXISTS saved_searches (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('cargas', 'camiones')),
          filters_json TEXT NOT NULL DEFAULT '{}',
          label TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_searches(user_id);
        CREATE TABLE IF NOT EXISTS alert_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          listing_kind TEXT NOT NULL CHECK (listing_kind IN ('carga', 'camion')),
          listing_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          delivery TEXT NOT NULL,
          sent_at TEXT NOT NULL,
          UNIQUE (user_id, listing_kind, listing_id)
        );
        CREATE INDEX IF NOT EXISTS idx_alert_user_time ON alert_log(user_id, sent_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_alert_token ON users(alert_token);`,
      );
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 5) {
    const apply = db.transaction(() => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS wa_conversations (
          id TEXT PRIMARY KEY,
          chat_key TEXT NOT NULL UNIQUE,
          wa_id TEXT,
          user_id TEXT,
          name TEXT,
          bot_disabled INTEGER NOT NULL DEFAULT 0,
          paused_until TEXT,
          pause_reason TEXT,
          handoff_at TEXT,
          last_inbound_at TEXT,
          last_message_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_wa_conv_last ON wa_conversations(last_message_at);
        CREATE TABLE IF NOT EXISTS wa_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
          wamid TEXT UNIQUE,
          direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
          source TEXT NOT NULL CHECK (source IN ('cliente', 'bot', 'humano', 'sistema')),
          type TEXT NOT NULL,
          body TEXT NOT NULL,
          engine TEXT,
          status TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON wa_messages(conversation_id, created_at);
        CREATE TABLE IF NOT EXISTS wa_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );`,
      );
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 6) {
    const apply = db.transaction(() => {
      // Fase 1 tipo inDrive: solicitudes con plazo para ofertar, ofertas de transportistas aprobados y adjudicación.
      if (!hasColumn(db, "loads", "status")) db.exec(`ALTER TABLE loads ADD COLUMN status TEXT NOT NULL DEFAULT 'abierta'`);
      if (!hasColumn(db, "loads", "offers_until")) db.exec(`ALTER TABLE loads ADD COLUMN offers_until TEXT`);
      if (!hasColumn(db, "loads", "allow_improve")) db.exec(`ALTER TABLE loads ADD COLUMN allow_improve INTEGER`);
      if (!hasColumn(db, "loads", "awarded_offer_id")) db.exec(`ALTER TABLE loads ADD COLUMN awarded_offer_id TEXT`);
      db.exec(
        `CREATE TABLE IF NOT EXISTS offers (
          id TEXT PRIMARY KEY,
          load_id TEXT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
          carrier_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          truck_id TEXT REFERENCES trucks(id) ON DELETE SET NULL,
          price_clp INTEGER NOT NULL,
          pickup_date TEXT NOT NULL,
          note TEXT,
          status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa', 'aceptada', 'rechazada', 'retirada')),
          revisions INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (load_id, carrier_id)
        );
        CREATE INDEX IF NOT EXISTS idx_offers_load ON offers(load_id, status);
        CREATE INDEX IF NOT EXISTS idx_offers_carrier ON offers(carrier_id, created_at);
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          actor_id TEXT,
          actor_email TEXT,
          action TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          detail TEXT,
          ip TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);`,
      );
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 7) {
    const apply = db.transaction(() => {
      // Aceptación de la Política de Privacidad al registrarse: fecha y versión aceptada por cada cuenta.
      if (!hasColumn(db, "users", "privacy_accepted_at")) db.exec(`ALTER TABLE users ADD COLUMN privacy_accepted_at TEXT`);
      if (!hasColumn(db, "users", "privacy_version")) db.exec(`ALTER TABLE users ADD COLUMN privacy_version TEXT`);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (7, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 8) {
    const apply = db.transaction(() => {
      // Acreditación 100%: requisitos de calidad, seguridad y medio ambiente que revisa un administrador por cuenta.
      for (const column of ["req_calidad", "req_seguridad", "req_medioambiente"]) {
        if (!hasColumn(db, "users", column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT 'pendiente'`);
      }
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (8, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 9) {
    const apply = db.transaction(() => {
      // Términos de uso versionados (aceptación junto a la Política de Privacidad) y periodo gratis de 30 días por cuenta.
      if (!hasColumn(db, "users", "terms_accepted_at")) db.exec(`ALTER TABLE users ADD COLUMN terms_accepted_at TEXT`);
      if (!hasColumn(db, "users", "terms_version")) db.exec(`ALTER TABLE users ADD COLUMN terms_version TEXT`);
      if (!hasColumn(db, "users", "free_until")) db.exec(`ALTER TABLE users ADD COLUMN free_until TEXT`);
      // Cuentas existentes: 30 días desde su inscripción; si ese plazo ya pasó, 30 días desde hoy.
      const today = todayChile();
      const rows = db.prepare(`SELECT id, created_at FROM users WHERE role <> 'admin' AND free_until IS NULL`).all() as { id: string; created_at: string }[];
      const set = db.prepare(`UPDATE users SET free_until = ? WHERE id = ?`);
      for (const row of rows) {
        const fromSignup = freeUntilFrom(row.created_at);
        set.run(fromSignup < today ? addDaysIso(today, FREE_DAYS) : fromSignup, row.id);
      }
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (9, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 10) {
    const apply = db.transaction(() => {
      // Segundo factor del administrador: código por correo, dispositivos de confianza y sesiones marcadas con mfa_at.
      if (!hasColumn(db, "sessions", "mfa_at")) db.exec(`ALTER TABLE sessions ADD COLUMN mfa_at TEXT`);
      db.exec(
        `CREATE TABLE IF NOT EXISTS login_challenges (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          ip TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_login_challenges_user ON login_challenges(user_id, created_at);
        CREATE TABLE IF NOT EXISTS trusted_devices (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          ip TEXT,
          user_agent TEXT,
          created_at TEXT NOT NULL,
          last_used_at TEXT
        );`,
      );
      // Las sesiones de administrador abiertas antes del segundo factor quedan cerradas.
      db.prepare(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')`).run();
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (10, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 11) {
    const apply = db.transaction(() => {
      // Chat de la web: conversaciones del widget, separadas de WhatsApp.
      db.exec(
        `CREATE TABLE IF NOT EXISTS web_chat_conversations (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          ip_hash TEXT,
          user_agent TEXT,
          bot_disabled INTEGER NOT NULL DEFAULT 0,
          handoff_at TEXT,
          last_inbound_at TEXT,
          last_message_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_webchat_session ON web_chat_conversations(session_id);
        CREATE INDEX IF NOT EXISTS idx_webchat_last ON web_chat_conversations(last_message_at);
        CREATE TABLE IF NOT EXISTS web_chat_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES web_chat_conversations(id) ON DELETE CASCADE,
          direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
          source TEXT NOT NULL CHECK (source IN ('cliente', 'bot', 'sistema')),
          body TEXT NOT NULL,
          engine TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_webchat_msg_conv ON web_chat_messages(conversation_id, created_at);`,
      );
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (11, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 12) {
    const apply = db.transaction(() => {
      if (!hasColumn(db, "loads", "inmediata")) db.exec(`ALTER TABLE loads ADD COLUMN inmediata INTEGER NOT NULL DEFAULT 0`);
      if (!hasColumn(db, "loads", "trip_status")) db.exec(`ALTER TABLE loads ADD COLUMN trip_status TEXT`);
      db.exec(`
        CREATE TABLE IF NOT EXISTS trip_events (
          id TEXT PRIMARY KEY,
          load_id TEXT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
          actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          status TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trip_events_load ON trip_events(load_id, created_at);
        CREATE TABLE IF NOT EXISTS ratings (
          id TEXT PRIMARY KEY,
          load_id TEXT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
          from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
          comment TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (load_id, from_user_id)
        );
      `);
      db.prepare(`UPDATE loads SET trip_status = 'asignado' WHERE status = 'adjudicada' AND trip_status IS NULL`).run();
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (12, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 13) {
    const apply = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_call_log (
          id TEXT PRIMARY KEY,
          day TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('reserved', 'ok', 'error', 'timeout', 'skipped')),
          fallback_reason TEXT,
          provider TEXT,
          model TEXT,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          created_at TEXT NOT NULL,
          finished_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_ai_call_day ON ai_call_log(day, status);
      `);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (13, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (schemaVersion(db) < 14) {
    const apply = db.transaction(() => {
      // Contacto de respaldo (teléfono o correo) para cuentas con verificación pendiente, y verificación manual
      // del administrador: acceso de solo lectura por 30 días (estado efectivo "manual_readonly", ver manual-readonly.ts).
      // Solo agrega columnas nulas: no cambia datos existentes. Copia legible en docs/migrations/014-verificacion-respaldo.sql.
      for (const column of MIGRATION_14_USER_COLUMNS) {
        if (!hasColumn(db, "users", column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_manual_readonly ON users(manual_readonly_until)`);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (14, ?)`).run(new Date().toISOString());
    });
    apply();
  }
}

export function closeDb() {
  database?.close();
  database = null;
}
