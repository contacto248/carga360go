import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { addDaysIso, FREE_DAYS, freeUntilFrom } from "./campaign";
import { todayChile } from "./format";
import { DEFAULT_RATES, MIN_TRIP_CLP, ROAD_FACTOR } from "./freight-defaults";

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

/** Migración 14: columnas nulas en users. La aplicación las agrega solo si faltan. */
export const MIGRATION_14_USER_COLUMNS = [
  "backup_contact",
  "backup_contact_type",
  "backup_contact_at",
  "manual_readonly_until",
  "manual_readonly_at",
  "manual_readonly_by",
  "manual_readonly_by_email",
] as const;

/**
 * Migración 15, congelada: agente comercial y de voz.
 * Solo crea tablas e índices. Incluye load_tracking_codes y agent_otp_challenges.
 * CREATE TABLE IF NOT EXISTS: se puede ejecutar de nuevo sin duplicar.
 */
export const MIGRATION_15_SQL = `
CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'telefono')),
  session_key TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  state TEXT NOT NULL DEFAULT '{}',
  last_intent TEXT,
  handoff_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_conv_session ON agent_conversations(channel, session_key);
CREATE INDEX IF NOT EXISTS idx_agent_conv_updated ON agent_conversations(updated_at);
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('cliente', 'agente', 'sistema')),
  body TEXT NOT NULL,
  via TEXT CHECK (via IN ('texto', 'voz')),
  engine TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_msg_conv ON agent_messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS agent_leads (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'telefono')),
  kind TEXT NOT NULL CHECK (kind IN ('cotizacion', 'registro', 'derivacion')),
  status TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'en_gestion', 'cerrado', 'descartado')),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT,
  contact TEXT,
  contact_type TEXT CHECK (contact_type IS NULL OR contact_type IN ('email', 'telefono')),
  backup_contact TEXT,
  backup_contact_type TEXT CHECK (backup_contact_type IS NULL OR backup_contact_type IN ('email', 'telefono')),
  role TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_leads_created ON agent_leads(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_leads_status ON agent_leads(status, kind);
CREATE TABLE IF NOT EXISTS load_tracking_codes (
  load_id TEXT PRIMARY KEY REFERENCES loads(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_otp_challenges (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  load_id TEXT REFERENCES loads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_otp_conv ON agent_otp_challenges(conversation_id, created_at);
`;

export const MIGRATION_15_TABLES = [
  "agent_conversations",
  "agent_messages",
  "agent_leads",
  "load_tracking_codes",
  "agent_otp_challenges",
] as const;

/**
 * Migración 16: parámetros del cálculo vigente (tarifa por km, factor de ruta, mínimo por viaje)
 * y auditoría de cada alta o cambio. No guarda comisiones ni otro modelo de cobro.
 * Otra rama sin fusionar usó el número 16 para tablas cost_* (peajes y diésel). Esta 16 no las crea.
 */
export const MIGRATION_16_SQL = `
CREATE TABLE IF NOT EXISTS freight_cost_settings (
  key TEXT PRIMARY KEY CHECK (key IN ('road_factor', 'min_trip_liviano', 'min_trip_pesado')),
  value_real REAL NOT NULL CHECK (value_real > 0),
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS freight_km_rates (
  equipment TEXT PRIMARY KEY,
  rate_min INTEGER NOT NULL CHECK (rate_min > 0),
  rate_max INTEGER NOT NULL CHECK (rate_max >= rate_min),
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS freight_param_audit (
  id TEXT PRIMARY KEY,
  param_key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_freight_param_audit_time ON freight_param_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_freight_param_audit_key ON freight_param_audit(param_key, created_at);
`;

export const MIGRATION_16_TABLES = ["freight_cost_settings", "freight_km_rates", "freight_param_audit"] as const;

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

function hasMigration(db: Database.Database, version: number): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM schema_migrations WHERE version = ?`).get(version));
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

function hasTable(db: Database.Database, name: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

/** Completa la semilla solo donde falta la fila. No pisa un valor ya guardado. */
function ensureFreightSeed(db: Database.Database) {
  if (!MIGRATION_16_TABLES.every((table) => hasTable(db, table))) return;
  const now = new Date().toISOString();
  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO freight_cost_settings (key, value_real, updated_at, updated_by) VALUES (?, ?, ?, 'sistema')`,
  );
  const insertRate = db.prepare(
    `INSERT OR IGNORE INTO freight_km_rates (equipment, rate_min, rate_max, updated_at, updated_by) VALUES (?, ?, ?, ?, 'sistema')`,
  );
  const insertAudit = db.prepare(
    `INSERT INTO freight_param_audit (id, param_key, old_value, new_value, actor_id, actor_email, created_at)
     VALUES (?, ?, NULL, ?, NULL, 'sistema', ?)`,
  );
  const seed = db.transaction(() => {
    const settings: [string, number][] = [
      ["road_factor", ROAD_FACTOR],
      ["min_trip_liviano", MIN_TRIP_CLP.liviano],
      ["min_trip_pesado", MIN_TRIP_CLP.pesado],
    ];
    for (const [key, value] of settings) {
      if (insertSetting.run(key, value, now).changes === 1) insertAudit.run(randomUUID(), key, String(value), now);
    }
    for (const [equipment, rates] of Object.entries(DEFAULT_RATES)) {
      if (insertRate.run(equipment, rates[0], rates[1], now).changes === 1) {
        insertAudit.run(randomUUID(), `tarifa:${equipment}`, `${rates[0]},${rates[1]}`, now);
      }
    }
  });
  seed();
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
  if (schemaVersion(db) < 14 || MIGRATION_14_USER_COLUMNS.some((column) => !hasColumn(db, "users", column))) {
    const apply = db.transaction(() => {
      // Contacto de respaldo y verificación manual de solo lectura. Solo columnas nulas.
      // Si otra instalación ya marcó la versión 14, se completan las columnas y no se duplica el registro.
      for (const column of MIGRATION_14_USER_COLUMNS) {
        if (!hasColumn(db, "users", column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_manual_readonly ON users(manual_readonly_until)`);
      db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (14, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 15) || MIGRATION_15_TABLES.some((table) => !hasTable(db, table))) {
    const apply = db.transaction(() => {
      db.exec(MIGRATION_15_SQL);
      db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (15, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 16) || MIGRATION_16_TABLES.some((table) => !hasTable(db, table))) {
    const apply = db.transaction(() => {
      db.exec(MIGRATION_16_SQL);
      db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (16, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  ensureFreightSeed(db);
}

export function closeDb() {
  database?.close();
  database = null;
}
