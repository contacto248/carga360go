import fs from "fs";
import path from "path";
import { MIGRATION_17_SQL, MIGRATION_18_SQL } from "./bassam/schema";
import { MIGRATION_27_SQL } from "./ops/gps/schema";
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

/**
 * Migración 023 (OPS-102): envío operativo y bitácora encadenada.
 * Copia en docs/migrations/023-ops-envios.sql. Va después de la 022 y no la modifica.
 * Solo crea tablas nuevas. No altera users, loads, offers ni trip_events.
 */
export const MIGRATION_23_SQL = `
CREATE TABLE IF NOT EXISTS ops_shipments (
  id TEXT PRIMARY KEY,
  load_id TEXT UNIQUE REFERENCES loads(id) ON DELETE SET NULL,
  shipper_org_id TEXT,
  carrier_org_id TEXT,
  rate_card_id TEXT,
  lane_id TEXT,
  assigned_offer_id TEXT,
  stage TEXT NOT NULL CHECK (stage IN ('negociacion','asignacion','ejecucion','pod','auditoria','facturacion','pago','cerrado','cancelado')),
  planned_pickup_at TEXT,
  planned_delivery_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_shipments_stage ON ops_shipments(stage, updated_at);

CREATE TABLE IF NOT EXISTS ops_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  actor_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (shipment_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_ops_events_shipment ON ops_events(shipment_id, seq);
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

/** Migración 22: organizaciones y miembros OPS. Solo tablas nuevas (docs/migrations/022-ops-organizaciones.sql). */
export const MIGRATION_22_SQL = `
CREATE TABLE IF NOT EXISTS ops_organizations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('mandante', 'transportista', 'plataforma')),
  razon_social TEXT NOT NULL,
  rut_norm TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES ops_organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area TEXT,
  ops_role TEXT NOT NULL CHECK (ops_role IN ('org_admin', 'procurement', 'trafico', 'finanzas', 'auditor', 'lectura')),
  status TEXT NOT NULL CHECK (status IN ('activo', 'suspendido')),
  created_at TEXT NOT NULL,
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ops_org_members_user ON ops_org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ops_org_members_org ON ops_org_members(org_id);
`;

/** Migración 24: procurement (zonas, rutas, contratos, tarifas, SLA). Solo tablas nuevas. */
export const MIGRATION_24_SQL = `
CREATE TABLE IF NOT EXISTS ops_zones (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES ops_organizations(id),
  name TEXT NOT NULL,
  comunas_json TEXT NOT NULL DEFAULT '[]',
  region TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_lanes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES ops_organizations(id),
  origin_zone_id TEXT NOT NULL REFERENCES ops_zones(id),
  destination_zone_id TEXT NOT NULL REFERENCES ops_zones(id),
  distance_km REAL,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, origin_zone_id, destination_zone_id)
);

CREATE TABLE IF NOT EXISTS ops_contracts (
  id TEXT PRIMARY KEY,
  shipper_org_id TEXT NOT NULL REFERENCES ops_organizations(id),
  carrier_org_id TEXT REFERENCES ops_organizations(id),
  kind TEXT NOT NULL CHECK (kind IN ('contrato_marco', 'licitacion', 'spot')),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('borrador', 'en_revision', 'vigente', 'vencido', 'terminado')),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  parent_id TEXT REFERENCES ops_contracts(id),
  document_id TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (valid_from < valid_to)
);

CREATE TABLE IF NOT EXISTS ops_rate_cards (
  id TEXT PRIMARY KEY,
  contract_id TEXT REFERENCES ops_contracts(id),
  shipper_org_id TEXT NOT NULL REFERENCES ops_organizations(id),
  carrier_org_id TEXT REFERENCES ops_organizations(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('borrador', 'vigente', 'vencida', 'anulada')),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (valid_from < valid_to)
);

CREATE TABLE IF NOT EXISTS ops_rate_card_lines (
  id TEXT PRIMARY KEY,
  rate_card_id TEXT NOT NULL REFERENCES ops_rate_cards(id) ON DELETE CASCADE,
  lane_id TEXT NOT NULL REFERENCES ops_lanes(id),
  equipment TEXT NOT NULL,
  vehicle_class TEXT,
  rate_kind TEXT NOT NULL CHECK (rate_kind IN ('por_viaje', 'por_tonelada', 'por_km')),
  amount_clp INTEGER NOT NULL CHECK (amount_clp > 0),
  min_charge_clp INTEGER CHECK (min_charge_clp IS NULL OR min_charge_clp > 0),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS ops_commercial_terms (
  id TEXT PRIMARY KEY,
  rate_card_id TEXT NOT NULL REFERENCES ops_rate_cards(id) ON DELETE CASCADE,
  payment_days INTEGER NOT NULL CHECK (payment_days >= 0),
  diesel_clause_json TEXT,
  detention_free_hours REAL,
  detention_rate_clp INTEGER CHECK (detention_rate_clp IS NULL OR detention_rate_clp >= 0),
  insurance_required INTEGER NOT NULL CHECK (insurance_required IN (0, 1)),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS ops_slas (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES ops_contracts(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('retiro_a_tiempo', 'entrega_a_tiempo', 'tiempo_aceptacion', 'pod_en_plazo', 'documentos_al_dia')),
  target REAL NOT NULL,
  unit TEXT NOT NULL,
  tolerance REAL,
  penalty_note TEXT,
  CHECK (unit != '%' OR (target >= 0 AND target <= 100))
);

CREATE TABLE IF NOT EXISTS ops_versions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  changed_by TEXT,
  change_note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (entity_type, entity_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ops_zones_org ON ops_zones(org_id);
CREATE INDEX IF NOT EXISTS idx_ops_lanes_org ON ops_lanes(org_id);
CREATE INDEX IF NOT EXISTS idx_ops_contracts_shipper ON ops_contracts(shipper_org_id, status);
CREATE INDEX IF NOT EXISTS idx_ops_rate_cards_shipper ON ops_rate_cards(shipper_org_id, status);
CREATE INDEX IF NOT EXISTS idx_ops_rate_lines_card ON ops_rate_card_lines(rate_card_id);
CREATE INDEX IF NOT EXISTS idx_ops_terms_card ON ops_commercial_terms(rate_card_id);
CREATE INDEX IF NOT EXISTS idx_ops_slas_contract ON ops_slas(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_versions_entity ON ops_versions(entity_type, entity_id);
`;

/** Migración 25: puntaje de desempeño. Solo tablas nuevas (docs/migrations/025-ops-desempeno.sql). No altera 022, 023, 024 ni 027. */
export const MIGRATION_25_SQL = `
CREATE TABLE IF NOT EXISTS ops_carrier_scores (
  id TEXT PRIMARY KEY,
  carrier_user_id TEXT NOT NULL,
  carrier_org_id TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  trips_done INTEGER NOT NULL,
  on_time_pct REAL,
  cancel_count INTEGER NOT NULL,
  incident_count INTEGER NOT NULL,
  avg_rating REAL,
  docs_valid INTEGER,
  score REAL NOT NULL,
  level TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE (carrier_user_id, period_end, rules_version)
);

CREATE INDEX IF NOT EXISTS idx_ops_carrier_scores_carrier ON ops_carrier_scores(carrier_user_id, period_end);

CREATE TABLE IF NOT EXISTS ops_score_events (
  id TEXT PRIMARY KEY,
  carrier_user_id TEXT NOT NULL,
  load_id TEXT,
  rule_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_score_events_carrier ON ops_score_events(carrier_user_id, created_at);
`;

/** Migración 26: asignación en modo propuesta. Solo tablas nuevas. No altera 022, 023, 024, 025 ni 027. */
export const MIGRATION_26_SQL = `
CREATE TABLE IF NOT EXISTS ops_allocation_rules (
  id TEXT PRIMARY KEY,
  shipper_org_id TEXT NOT NULL,
  lane_id TEXT,
  equipment TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('directa', 'por_tarifa', 'por_desempeno', 'cascada')),
  weights_json TEXT NOT NULL,
  min_score REAL,
  accept_timeout_minutes INTEGER NOT NULL,
  max_rounds INTEGER NOT NULL,
  active INTEGER NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_rules_org ON ops_allocation_rules(shipper_org_id, active);

CREATE TABLE IF NOT EXISTS ops_allocation_runs (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL,
  rule_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('propuesta', 'en_cascada', 'confirmada', 'agotada', 'cancelada')),
  dry_run INTEGER NOT NULL DEFAULT 1,
  started_by TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_runs_shipment ON ops_allocation_runs(shipment_id, created_at);

CREATE TABLE IF NOT EXISTS ops_allocation_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ops_allocation_runs(id) ON DELETE CASCADE,
  carrier_user_id TEXT NOT NULL,
  truck_id TEXT,
  rank INTEGER NOT NULL,
  rate_clp INTEGER,
  score REAL,
  match_score REAL,
  availability TEXT,
  reasons_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('propuesto', 'invitado', 'acepto', 'rechazo', 'vencido', 'descartado')),
  attempt INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  responded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_candidates_run ON ops_allocation_candidates(run_id, rank);

CREATE TABLE IF NOT EXISTS ops_allocation_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ops_allocation_runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  step TEXT NOT NULL,
  rule_id TEXT,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_decisions_run ON ops_allocation_decisions(run_id, seq);

CREATE TABLE IF NOT EXISTS ops_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'en_curso', 'hecho', 'error', 'cancelado')),
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  run_after TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_jobs_due ON ops_jobs(status, run_after);
CREATE INDEX IF NOT EXISTS idx_ops_jobs_ref ON ops_jobs(kind, ref_id);
`;

/** Migración 28: traza inmutable de la decisión. Solo una tabla nueva. No altera la 026 ni tablas previas. */
export const MIGRATION_28_SQL = `
CREATE TABLE IF NOT EXISTS ops_allocation_traces (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  trace_version TEXT NOT NULL CHECK (trace_version = 'trace-v1'),
  trace_json TEXT NOT NULL,
  trace_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_allocation_traces_run ON ops_allocation_traces(run_id);

CREATE TRIGGER IF NOT EXISTS ops_allocation_traces_no_update
BEFORE UPDATE ON ops_allocation_traces
BEGIN
  SELECT RAISE(ABORT, 'traza inmutable');
END;

CREATE TRIGGER IF NOT EXISTS ops_allocation_traces_no_delete
BEFORE DELETE ON ops_allocation_traces
BEGIN
  SELECT RAISE(ABORT, 'traza inmutable');
END;
`;

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
  if (!hasMigration(db, 22)) {
    const apply = db.transaction(() => {
      // Organizaciones y miembros del núcleo operativo. Solo tablas nuevas, sin filas de ejemplo.
      // No altera users. Copia en docs/migrations/022-ops-organizaciones.sql.
      // Reversa: docs/migrations/022-ops-organizaciones-rollback.sql.
      db.exec(MIGRATION_22_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (22, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  // OPS-102. La 022 (organizaciones) queda intacta; este bloque solo agrega la 023.
  if (!hasMigration(db, 23)) {
    const apply = db.transaction(() => {
      // Envío operativo y bitácora con hash encadenado. Solo tablas nuevas.
      // Copia en docs/migrations/023-ops-envios.sql. Reversa: 023-ops-envios-rollback.sql.
      db.exec(MIGRATION_23_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (23, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 24)) {
    const apply = db.transaction(() => {
      // Procurement: zonas, rutas, contratos, tarifarios, condiciones y SLA.
      // Solo tablas nuevas, sin filas de ejemplo. No altera la 022, la 023 ni la 027.
      // Copia en docs/migrations/024-ops-procurement.sql.
      // Reversa: docs/migrations/024-ops-procurement-rollback.sql.
      db.exec(MIGRATION_24_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (24, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 25)) {
    const apply = db.transaction(() => {
      // Puntaje de desempeño. Solo tablas nuevas, sin filas de ejemplo.
      // No altera 022, 023, 024 ni 027.
      // Copia en docs/migrations/025-ops-desempeno.sql. Reversa: 025-ops-desempeno-rollback.sql.
      db.exec(MIGRATION_25_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (25, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 26)) {
    const apply = db.transaction(() => {
      // Asignación: reglas, propuestas, candidatos, bitácora y cola de reintentos.
      // Solo tablas nuevas, sin filas de ejemplo. No altera 022, 023, 024, 025 ni 027.
      // Copia en docs/migrations/026-ops-asignacion.sql. Reversa: 026-ops-asignacion-rollback.sql.
      db.exec(MIGRATION_26_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (26, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 27)) {
    const apply = db.transaction(() => {
      // OPS-301: fuente del conector (simulado o teléfono) y el recibo que apunta al punto ya guardado.
      // Solo tablas nuevas. No altera trip_gps_points. 024–026 siguen libres. Sin filas de ejemplo.
      // Copia en docs/migrations/027-gps-conector.sql. Reversa en docs/migrations/027-gps-conector-rollback.sql.
      db.exec(MIGRATION_27_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (27, ?)`).run(new Date().toISOString());
    });
    apply();
  }
  if (!hasMigration(db, 28)) {
    const apply = db.transaction(() => {
      // Traza de la decisión de asignación (trace-v1). Solo una tabla nueva y disparadores que impiden UPDATE/DELETE.
      // No altera 022–027 ni users, loads, offers o trucks. Sin filas de ejemplo.
      // Copia en docs/migrations/028-ops-asignacion-traza.sql. Reversa: 028-ops-asignacion-traza-rollback.sql.
      db.exec(MIGRATION_28_SQL);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (28, ?)`).run(new Date().toISOString());
    });
    apply();
  }
}

export function closeDb() {
  database?.close();
  database = null;
}
