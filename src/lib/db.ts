import fs from "fs";
import path from "path";
import { MIGRATION_17_SQL, MIGRATION_18_SQL } from "./bassam/schema";
import { seedTolls } from "./costos/tolls-seed";
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

/** Migración 15: agente comercial. Tablas nuevas, sin tocar las existentes (ver docs/migrations/015-agente-comercial.sql). */
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

/** Migración 16: tablas del motor de costos (ver docs/migrations/016-motor-costos.sql). */
export const MIGRATION_16_SQL = `
CREATE TABLE IF NOT EXISTS cost_params (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS cost_geocode_cache (
  key TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  label TEXT NOT NULL,
  region TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cost_route_cache (
  key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cost_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('peaje', 'diesel')),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  expected_sha256 TEXT,
  last_sha256 TEXT,
  status TEXT NOT NULL,
  last_ok_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cost_toll_plazas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  concession TEXT NOT NULL,
  route TEXT NOT NULL,
  km TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ambos', 'norte', 'sur')),
  scheme TEXT NOT NULL CHECK (scheme IN ('ejes', 'remolque')),
  kind TEXT NOT NULL,
  location_source TEXT NOT NULL,
  location_note TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES cost_sources(id),
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS cost_toll_rates (
  id TEXT PRIMARY KEY,
  plaza_id TEXT NOT NULL REFERENCES cost_toll_plazas(id),
  category TEXT NOT NULL,
  rate_type TEXT NOT NULL CHECK (rate_type IN ('unica', 'TBFP', 'TBP')),
  amount REAL NOT NULL CHECK (amount > 0),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES cost_sources(id),
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_toll_rates_plaza ON cost_toll_rates(plaza_id, category);
CREATE TABLE IF NOT EXISTS cost_diesel_prices (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  zone TEXT NOT NULL,
  price REAL NOT NULL,
  price_min REAL,
  price_max REAL,
  unit TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_diesel_zone ON cost_diesel_prices(zone, fetched_at);
CREATE TABLE IF NOT EXISTS cost_job_runs (
  id TEXT PRIMARY KEY,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS cost_quotes (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'revisada', 'enviada', 'descartada')),
  channel TEXT NOT NULL,
  origin_label TEXT NOT NULL,
  destination_label TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  distance_km REAL,
  base_cost INTEGER NOT NULL,
  reference_price INTEGER NOT NULL,
  complete INTEGER NOT NULL,
  method TEXT NOT NULL,
  input TEXT NOT NULL,
  result TEXT NOT NULL,
  contact TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_by_email TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_quotes_status ON cost_quotes(status, created_at);
`;

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

/** true si esa migración exacta ya se aplicó (independiente de MAX(version)). */
function hasMigration(db: Database.Database, version: number): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM schema_migrations WHERE version = ?`).get(version));
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
  if (schemaVersion(db) < 14 || MIGRATION_14_USER_COLUMNS.some((column) => !hasColumn(db, "users", column))) {
    const apply = db.transaction(() => {
      // Contacto de respaldo (teléfono o correo) para cuentas con verificación pendiente, y verificación manual
      // del administrador: acceso de solo lectura por 30 días (estado efectivo "manual_readonly", ver manual-readonly.ts).
      // Solo agrega columnas nulas: no cambia datos existentes. Copia legible en docs/migrations/014-verificacion-respaldo.sql.
      for (const column of MIGRATION_14_USER_COLUMNS) {
        if (!hasColumn(db, "users", column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_manual_readonly ON users(manual_readonly_until)`);
      // Algunas instalaciones usaron la versión 14 para ingreso_sin_documentos.
      // Reconciliar las columnas faltantes conserva ese campo y el registro original.
      db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (14, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 15)) {
    const apply = db.transaction(() => {
      // Agente comercial (web, WhatsApp y teléfono): conversaciones, mensajes y leads. Solo crea tablas nuevas.
      // Se comprueba por número exacto (no por MAX) para no saltarse si la 16 se aplicó antes:
      // no modifica ni borra datos existentes. Copia legible en docs/migrations/015-agente-comercial.sql.
      db.exec(MIGRATION_15_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (15, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 16)) {
    const apply = db.transaction(() => {
      // Motor de costos logísticos: parámetros, cachés de ruta y geocodificación, plazas y tarifas de peaje con
      // fuente y vigencia, histórico del diésel, estado de fuentes, corridas del job y cotizaciones con revisión.
      // Solo crea tablas nuevas. Se comprueba por número exacto (no por MAX) para convivir con la migración 15
      // de otra rama. Copia legible en docs/migrations/016-motor-costos.sql.
      db.exec(MIGRATION_16_SQL);
      seedTolls(db);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (16, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 17)) {
    const apply = db.transaction(() => {
      // Tablas de solicitudes, transportistas, documentos y el historial BASSAM 360.
      // Solo crea tablas nuevas. No inserta personas. Copia en docs/migrations/017-bassam-tablas.sql.
      db.exec(MIGRATION_17_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (17, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasColumn(db, "transportistas", "user_id")) db.exec(`ALTER TABLE transportistas ADD COLUMN user_id TEXT`);
  if (!hasMigration(db, 18)) {
    db.pragma("foreign_keys = OFF");
    try {
      const apply = db.transaction(() => {
        // tipo_cliente transportista o mandante. El SELECT copia filas ya guardadas y no agrega ejemplos.
        db.exec(MIGRATION_18_SQL);
        db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (18, ?)`).run(new Date().toISOString());
      });
      apply();
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }
  if (!hasMigration(db, 19)) {
    const apply = db.transaction(() => {
      // Columna para el RUT leído del archivo. No inserta filas.
      if (!hasColumn(db, "documentos_acreditacion", "rut_extraido")) db.exec(`ALTER TABLE documentos_acreditacion ADD COLUMN rut_extraido TEXT`);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (19, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 20)) {
    const apply = db.transaction(() => {
      // Vuelve a sembrar peajes (INSERT OR IGNORE): agrega Ruta 68 y Angostura en bases que ya tenían la 16.
      // No borra plazas ni tarifas anteriores. Copia en docs/migrations/020-peajes-ruta.sql.
      seedTolls(db);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (20, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 21)) {
    const apply = db.transaction(() => {
      // Vuelve a sembrar peajes (INSERT OR IGNORE): agrega Agua Amarilla (Itata) y las fuentes MOP 2026 revisadas.
      // No borra plazas ni tarifas anteriores. Copia en docs/migrations/021-peaje-itata.sql.
      seedTolls(db);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (21, ?)`).run(new Date().toISOString());
    });
    apply();
  }
}

export function closeDb() {
  database?.close();
  database = null;
}
