import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { closeDb, getDb, MIGRATION_23_SQL, MIGRATION_26_SQL } from "../src/lib/db";

const FIX = path.join(__dirname, "fixtures", "db");
const ORIGINAL_PATH = process.env.DATABASE_PATH;
const TABLES_15 = ["agent_conversations", "agent_messages", "agent_leads", "load_tracking_codes", "agent_otp_challenges"];
const TABLES_16 = ["cost_params", "cost_geocode_cache", "cost_route_cache", "cost_sources", "cost_toll_plazas", "cost_toll_rates", "cost_diesel_prices", "cost_job_runs", "cost_quotes"];

/** Abre una copia de la base indicada con el código de esta versión (aplica las migraciones pendientes). */
function openCopy(fixture: string | null) {
  closeDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c360-mig-"));
  const file = path.join(dir, "copia.sqlite");
  if (fixture) fs.copyFileSync(path.join(FIX, fixture), file);
  process.env.DATABASE_PATH = file;
  return getDb();
}

function snapshot(file: string) {
  const db = new Database(file, { readonly: true });
  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  const out = {
    version: (db.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as { v: number }).v,
    users: db.prepare(`SELECT * FROM users ORDER BY id`).all(),
    loads: db.prepare(`SELECT * FROM loads ORDER BY id`).all(),
    trucks: db.prepare(`SELECT * FROM trucks ORDER BY id`).all(),
    counts: { users: count("users"), loads: count("loads"), trucks: count("trucks") },
  };
  db.close();
  return out;
}

function versions(db: Database.Database) {
  return (db.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as { version: number }[]).map((r) => r.version);
}

function hasTable(db: Database.Database, name: string) {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

function assertFinalSchema(db: Database.Database) {
  const v = versions(db);
  for (const n of [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]) assert.ok(v.includes(n), `falta la migración ${n}: ${v.join(",")}`);
  assert.equal(Math.max(...v), 27);
  for (const t of [...TABLES_15, ...TABLES_16, "solicitudes_carga", "transportistas", "documentos_acreditacion", "admin_bassam_360", "ops_organizations", "ops_org_members", "ops_shipments", "ops_events", "ops_zones", "ops_lanes", "ops_contracts", "ops_rate_cards", "ops_rate_card_lines", "ops_commercial_terms", "ops_slas", "ops_versions", "ops_carrier_scores", "ops_score_events", "ops_allocation_rules", "ops_allocation_runs", "ops_allocation_candidates", "ops_allocation_decisions", "ops_jobs", "ops_telematics_sources", "ops_gps_receipts"]) assert.ok(hasTable(db, t), t);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_organizations`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_org_members`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_shipments`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_telematics_sources`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_zones`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_rate_cards`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_carrier_scores`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_score_events`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_allocation_rules`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_allocation_runs`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_jobs`).get() as { n: number }).n, 0);
  const usersSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get() as { sql: string }).sql;
  assert.match(usersSql, /'transportista', 'mandante', 'admin'/);
  const userCols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  for (const c of ["backup_contact", "backup_contact_type", "manual_readonly_until", "manual_readonly_by"]) assert.ok(userCols.includes(c), c);
  assert.ok((db.prepare(`SELECT COUNT(*) AS n FROM cost_toll_rates`).get() as { n: number }).n > 0, "peajes MOP sembrados");
  assert.equal((db.prepare(`PRAGMA foreign_key_check`).all() as unknown[]).length, 0);
  assert.equal((db.prepare(`PRAGMA integrity_check`).get() as { integrity_check: string }).integrity_check, "ok");
}

test("BD nueva: 14, 15 y 16 se aplican en orden", () => {
  const db = openCopy(null);
  assertFinalSchema(db);
  const rows = db.prepare(`SELECT version, applied_at FROM schema_migrations WHERE version IN (14, 15, 16) ORDER BY version`).all() as { version: number; applied_at: string }[];
  assert.deepEqual(rows.map((r) => r.version), [14, 15, 16]);
  assert.ok(rows[0].applied_at <= rows[1].applied_at && rows[1].applied_at <= rows[2].applied_at);
});

test("copia del esquema de producción en versión 13 (base 2f82122) sube a 16 sin perder datos", () => {
  const before = snapshot(path.join(FIX, "produccion-v13.sqlite"));
  assert.equal(before.version, 13);
  const db = openCopy("produccion-v13.sqlite");
  assertFinalSchema(db);
  const file = process.env.DATABASE_PATH!;
  closeDb();
  const after = snapshot(file);
  assert.deepEqual(after.counts, before.counts);
  assert.deepEqual(after.loads, before.loads);
  assert.deepEqual(after.trucks, before.trucks);
  // Usuarios: mismas filas y mismos valores en las columnas previas; las nuevas de la 14 quedan nulas.
  assert.equal(after.users.length, before.users.length);
  after.users.forEach((u, i) => {
    const prev = before.users[i] as Record<string, unknown>;
    for (const [k, val] of Object.entries(prev)) assert.deepEqual((u as Record<string, unknown>)[k], val, k);
    assert.equal((u as Record<string, unknown>).manual_readonly_until, null);
  });
});

test("copia en versión 14 (verificación manual) sube a 16 sin perder datos ni el contacto de respaldo", () => {
  const before = snapshot(path.join(FIX, "produccion-v14.sqlite"));
  assert.equal(before.version, 14);
  const db = openCopy("produccion-v14.sqlite");
  assertFinalSchema(db);
  const file = process.env.DATABASE_PATH!;
  closeDb();
  const after = snapshot(file);
  assert.deepEqual(after, { ...before, version: 27 });
  const mandante = (after.users as Record<string, unknown>[]).find((u) => u.email === "mandante@demo.local")!;
  assert.equal(mandante.backup_contact, "respaldo@demo.local");
  assert.equal(mandante.manual_readonly_until, "2026-12-14T00:00:00.000Z");
});

test("una BD que ya tenía la 16 sin la 15 recibe la 15 (comprobación por número exacto)", () => {
  // Simula una base que aplicó la rama del motor de costos antes que la del agente.
  const db = openCopy("produccion-v14.sqlite");
  const file = process.env.DATABASE_PATH!;
  for (const t of TABLES_15) db.exec(`DROP TABLE ${t}`);
  db.prepare(`DELETE FROM schema_migrations WHERE version = 15`).run();
  assert.equal(hasTable(db, "agent_leads"), false);
  closeDb();
  process.env.DATABASE_PATH = file;
  const again = getDb();
  assertFinalSchema(again);
  assert.ok(hasTable(again, "agent_leads"));
});

test("reconcilia la migración 14 alternativa sin perder datos ni repetir su registro", () => {
  closeDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c360-mig-alternativa-"));
  const file = path.join(dir, "copia.sqlite");
  fs.copyFileSync(path.join(FIX, "produccion-v13.sqlite"), file);
  const raw = new Database(file);
  raw.exec(`ALTER TABLE users ADD COLUMN ingreso_sin_documentos INTEGER NOT NULL DEFAULT 0`);
  raw.prepare(`UPDATE users SET ingreso_sin_documentos = 1 WHERE id = (SELECT id FROM users ORDER BY id LIMIT 1)`).run();
  const appliedAt = "2026-11-13T16:00:00.000Z";
  raw.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (14, ?)`).run(appliedAt);
  raw.close();
  const before = snapshot(file);
  try {
    process.env.DATABASE_PATH = file;
    assertFinalSchema(getDb());
    closeDb();
    const after = snapshot(file);
    assert.deepEqual(after.counts, before.counts);
    assert.deepEqual(after.loads, before.loads);
    assert.deepEqual(after.trucks, before.trucks);
    after.users.forEach((user, i) => {
      for (const [key, value] of Object.entries(before.users[i] as Record<string, unknown>)) {
        assert.deepEqual((user as Record<string, unknown>)[key], value, key);
      }
    });
    const reopened = getDb();
    assertFinalSchema(reopened);
    assert.deepEqual(reopened.prepare(`SELECT applied_at FROM schema_migrations WHERE version = 14`).all(), [{ applied_at: appliedAt }]);
  } finally {
    closeDb();
    process.env.DATABASE_PATH = ORIGINAL_PATH;
  }
});

test("reversa 022 borra solo organizaciones y deja la 023 y la 027", () => {
  const db = openCopy("produccion-v14.sqlite");
  const file = process.env.DATABASE_PATH!;
  try {
    assert.ok(hasTable(db, "ops_organizations"));
    assert.ok(hasTable(db, "ops_shipments"));
    const before = {
      users: db.prepare(`SELECT * FROM users ORDER BY id`).all(),
      loads: db.prepare(`SELECT * FROM loads ORDER BY id`).all(),
      trucks: db.prepare(`SELECT * FROM trucks ORDER BY id`).all(),
      usersSql: (db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get() as { sql: string }).sql,
    };
    // La 024 referencia organizaciones: se revierte antes para que el DROP de la 022 siga siendo válido.
    db.exec(fs.readFileSync(path.join(process.cwd(), "docs/migrations/024-ops-procurement-rollback.sql"), "utf8"));
    db.exec(fs.readFileSync(path.join(process.cwd(), "docs/migrations/022-ops-organizaciones-rollback.sql"), "utf8"));
    assert.equal(hasTable(db, "ops_organizations"), false);
    assert.equal(hasTable(db, "ops_org_members"), false);
    assert.equal(versions(db).includes(22), false);
    assert.ok(hasTable(db, "ops_shipments"));
    assert.ok(versions(db).includes(23));
    assert.equal(versions(db).includes(27), true);
    assert.equal(Math.max(...versions(db)), 27);
    assert.equal(hasTable(db, "ops_telematics_sources"), true);
    assert.equal(hasTable(db, "ops_gps_receipts"), true);
    assert.deepEqual(db.prepare(`SELECT * FROM users ORDER BY id`).all(), before.users);
    assert.deepEqual(db.prepare(`SELECT * FROM loads ORDER BY id`).all(), before.loads);
    assert.deepEqual(db.prepare(`SELECT * FROM trucks ORDER BY id`).all(), before.trucks);
    assert.equal((db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get() as { sql: string }).sql, before.usersSql);
  } finally {
    closeDb();
    process.env.DATABASE_PATH = file;
    // Reabrir aplica de nuevo la 022: el sitio vuelve a quedar en el esquema vigente.
    assertFinalSchema(getDb());
    closeDb();
    process.env.DATABASE_PATH = ORIGINAL_PATH;
  }
});

const PROTECTED = ["users", "loads", "offers", "trip_events"] as const;

function sqlBody(text: string) {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

function protectedSnapshot(file: string) {
  const db = new Database(file, { readonly: true });
  const out: Record<string, { cols: string[]; rows: unknown[] }> = {};
  for (const table of PROTECTED) {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    out[table] = { cols, rows };
  }
  db.close();
  return out;
}

function protectedCols(db: Database.Database) {
  const out: Record<string, string[]> = {};
  for (const table of PROTECTED) {
    out[table] = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
  }
  return out;
}

test("la copia SQL de 023 coincide con el código y la reversa solo nombra esas tablas", () => {
  const doc = fs.readFileSync(path.join(__dirname, "../docs/migrations/023-ops-envios.sql"), "utf8");
  assert.equal(sqlBody(doc), sqlBody(MIGRATION_23_SQL));
  const rollback = fs.readFileSync(path.join(__dirname, "../docs/migrations/023-ops-envios-rollback.sql"), "utf8");
  assert.match(rollback, /DROP TABLE IF EXISTS ops_events/);
  assert.match(rollback, /DROP TABLE IF EXISTS ops_shipments/);
  assert.match(rollback, /DROP INDEX IF EXISTS idx_ops_events_shipment/);
  assert.match(rollback, /DROP INDEX IF EXISTS idx_ops_shipments_stage/);
  assert.match(rollback, /DELETE FROM schema_migrations WHERE version = 23/);
  assert.equal(/DROP TABLE(?! IF EXISTS ops_)/.test(rollback.replace(/--.*$/gm, "")), false);
});

test("023 sobre base vacía y sobre producción v14 no altera tablas previas; la reversa deja la 022", () => {
  const beforeFixture = protectedSnapshot(path.join(FIX, "produccion-v14.sqlite"));
  const rollback = fs.readFileSync(path.join(__dirname, "../docs/migrations/023-ops-envios-rollback.sql"), "utf8");
  const rollback22 = fs.readFileSync(path.join(__dirname, "../docs/migrations/022-ops-organizaciones-rollback.sql"), "utf8");
  try {
    for (const fixture of [null, "produccion-v14.sqlite"] as const) {
      const db = openCopy(fixture);
      assert.ok(hasTable(db, "ops_shipments"), fixture ?? "vacia");
      assert.ok(hasTable(db, "ops_events"), fixture ?? "vacia");
      assert.ok(hasTable(db, "ops_organizations"));
      assert.ok(versions(db).includes(22));
      assert.ok(versions(db).includes(23));
      const file = process.env.DATABASE_PATH!;
      closeDb();
      if (fixture) assert.deepEqual(protectedSnapshot(file), beforeFixture);
      const raw = new Database(file);
      raw.pragma("foreign_keys = ON");
      if (!fixture) {
        for (const table of PROTECTED) {
          assert.equal((raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
        }
      }
      const colsBefore = protectedCols(raw);
      raw.exec(fs.readFileSync(path.join(__dirname, "../docs/migrations/024-ops-procurement-rollback.sql"), "utf8"));
      raw.exec(rollback);
      assert.equal(Boolean(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ops_shipments'`).get()), false);
      assert.equal(Boolean(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ops_events'`).get()), false);
      const left = raw
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE name IN ('ops_shipments', 'ops_events', 'idx_ops_shipments_stage', 'idx_ops_events_shipment')
              OR name LIKE 'sqlite_autoindex_ops_shipments%'
              OR name LIKE 'sqlite_autoindex_ops_events%'`,
        )
        .all();
      assert.deepEqual(left, []);
      assert.equal(Boolean(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ops_organizations'`).get()), true);
      const afterVersions = (raw.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as { version: number }[]).map((row) => row.version);
      assert.equal(afterVersions.includes(23), false);
      assert.ok(afterVersions.includes(22));
      assert.ok(afterVersions.includes(27));
      assert.equal(Math.max(...afterVersions), 27);
      assert.equal(Boolean(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ops_telematics_sources'`).get()), true);
      assert.deepEqual(protectedCols(raw), colsBefore);
      raw.exec(rollback22);
      const unwound = (raw.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as { version: number }[]).map((row) => row.version);
      assert.equal(unwound.includes(22), false);
      assert.ok(unwound.includes(27));
      assert.equal(Math.max(...unwound), 27);
      assert.equal(Boolean(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ops_organizations'`).get()), false);
      assert.equal((raw.prepare(`PRAGMA foreign_key_check`).all() as unknown[]).length, 0);
      assert.equal((raw.prepare(`PRAGMA integrity_check`).get() as { integrity_check: string }).integrity_check, "ok");
      raw.close();
      process.env.DATABASE_PATH = file;
      const again = getDb();
      assert.ok(versions(again).includes(22));
      assert.ok(versions(again).includes(23));
      assert.ok(versions(again).includes(27));
      assert.ok(hasTable(again, "ops_shipments"));
      assert.ok(hasTable(again, "ops_organizations"));
      closeDb();
    }
  } finally {
    closeDb();
    process.env.DATABASE_PATH = ORIGINAL_PATH;
  }
});

test("reversa 024 borra solo procurement y deja la 023", () => {
  const db = openCopy("produccion-v14.sqlite");
  const file = process.env.DATABASE_PATH!;
  try {
    assert.ok(hasTable(db, "ops_zones"));
    assert.ok(hasTable(db, "ops_shipments"));
    const before = {
      users: db.prepare(`SELECT * FROM users ORDER BY id`).all(),
      loads: db.prepare(`SELECT * FROM loads ORDER BY id`).all(),
      shipments: (db.prepare(`SELECT COUNT(*) AS n FROM ops_shipments`).get() as { n: number }).n,
    };
    db.exec(fs.readFileSync(path.join(process.cwd(), "docs/migrations/024-ops-procurement-rollback.sql"), "utf8"));
    for (const table of ["ops_zones", "ops_lanes", "ops_contracts", "ops_rate_cards", "ops_rate_card_lines", "ops_commercial_terms", "ops_slas", "ops_versions"]) {
      assert.equal(hasTable(db, table), false, table);
    }
    assert.equal(versions(db).includes(24), false);
    assert.equal(versions(db).includes(23), true);
    assert.equal(versions(db).includes(27), true);
    assert.equal(Math.max(...versions(db)), 27);
    assert.ok(hasTable(db, "ops_organizations"));
    assert.ok(hasTable(db, "ops_shipments"));
    assert.ok(hasTable(db, "ops_telematics_sources"));
    assert.ok(hasTable(db, "ops_gps_receipts"));
    assert.deepEqual(db.prepare(`SELECT * FROM users ORDER BY id`).all(), before.users);
    assert.deepEqual(db.prepare(`SELECT * FROM loads ORDER BY id`).all(), before.loads);
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_shipments`).get() as { n: number }).n, before.shipments);
  } finally {
    closeDb();
    process.env.DATABASE_PATH = file;
    assertFinalSchema(getDb());
    closeDb();
    process.env.DATABASE_PATH = ORIGINAL_PATH;
  }
});

test("reversa 025 borra puntajes y conserva 022, 023, 024 y 027", () => {
  const db = openCopy("produccion-v14.sqlite");
  const file = process.env.DATABASE_PATH!;
  try {
    assert.ok(hasTable(db, "ops_carrier_scores"));
    assert.ok(hasTable(db, "ops_organizations"));
    assert.ok(hasTable(db, "ops_shipments"));
    assert.ok(hasTable(db, "ops_zones"));
    assert.ok(hasTable(db, "ops_gps_receipts"));
    const before = {
      users: db.prepare(`SELECT * FROM users ORDER BY id`).all(),
      loads: db.prepare(`SELECT * FROM loads ORDER BY id`).all(),
      trucks: db.prepare(`SELECT * FROM trucks ORDER BY id`).all(),
    };
    db.exec(fs.readFileSync(path.join(process.cwd(), "docs/migrations/025-ops-desempeno-rollback.sql"), "utf8"));
    assert.equal(hasTable(db, "ops_carrier_scores"), false);
    assert.equal(hasTable(db, "ops_score_events"), false);
    assert.equal(versions(db).includes(25), false);
    for (const n of [22, 23, 24, 27]) assert.ok(versions(db).includes(n), String(n));
    assert.equal(Math.max(...versions(db)), 27);
    assert.ok(hasTable(db, "ops_organizations"));
    assert.ok(hasTable(db, "ops_shipments"));
    assert.ok(hasTable(db, "ops_zones"));
    assert.ok(hasTable(db, "ops_telematics_sources"));
    assert.deepEqual(db.prepare(`SELECT * FROM users ORDER BY id`).all(), before.users);
    assert.deepEqual(db.prepare(`SELECT * FROM loads ORDER BY id`).all(), before.loads);
    assert.deepEqual(db.prepare(`SELECT * FROM trucks ORDER BY id`).all(), before.trucks);
  } finally {
    closeDb();
    process.env.DATABASE_PATH = file;
    assertFinalSchema(getDb());
    closeDb();
    process.env.DATABASE_PATH = ORIGINAL_PATH;
  }
});

test("abrir dos veces no repite migraciones", () => {
  const db = openCopy("produccion-v13.sqlite");
  const file = process.env.DATABASE_PATH!;
  const first = versions(db);
  const tolls = (db.prepare(`SELECT COUNT(*) AS n FROM cost_toll_rates`).get() as { n: number }).n;
  closeDb();
  process.env.DATABASE_PATH = file;
  const db2 = getDb();
  assert.deepEqual(versions(db2), first);
  assert.equal((db2.prepare(`SELECT COUNT(*) AS n FROM cost_toll_rates`).get() as { n: number }).n, tolls);
  closeDb();
  process.env.DATABASE_PATH = ORIGINAL_PATH;
});

test("la copia SQL de 026 coincide con el código y la reversa solo nombra esas tablas", () => {
  const doc = fs.readFileSync(path.join(__dirname, "../docs/migrations/026-ops-asignacion.sql"), "utf8");
  assert.equal(sqlBody(doc), sqlBody(MIGRATION_26_SQL));
  assert.equal(/ALTER\s+TABLE/i.test(sqlBody(doc)), false);
  const rollback = fs.readFileSync(path.join(__dirname, "../docs/migrations/026-ops-asignacion-rollback.sql"), "utf8");
  for (const table of ["ops_jobs", "ops_allocation_decisions", "ops_allocation_candidates", "ops_allocation_runs", "ops_allocation_rules"]) {
    assert.match(rollback, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
  for (const index of [
    "idx_ops_jobs_ref",
    "idx_ops_jobs_due",
    "idx_ops_allocation_decisions_run",
    "idx_ops_allocation_candidates_run",
    "idx_ops_allocation_runs_shipment",
    "idx_ops_allocation_rules_org",
  ]) {
    assert.match(rollback, new RegExp(`DROP INDEX IF EXISTS ${index}`));
  }
  assert.match(rollback, /DELETE FROM schema_migrations WHERE version = 26/);
  assert.equal(/DROP TABLE(?! IF EXISTS ops_)/.test(rollback.replace(/--.*$/gm, "")), false);
});

test("026 sobre base vacía y sobre producción v14 está presente junto con 022–025 y 027", () => {
  const beforeFixture = protectedSnapshot(path.join(FIX, "produccion-v14.sqlite"));
  try {
    for (const fixture of [null, "produccion-v14.sqlite"] as const) {
      const db = openCopy(fixture);
      for (const table of ["ops_allocation_rules", "ops_allocation_runs", "ops_allocation_candidates", "ops_allocation_decisions", "ops_jobs"]) {
        assert.ok(hasTable(db, table), `${fixture ?? "vacia"} ${table}`);
      }
      for (const n of [22, 23, 24, 25, 26, 27]) assert.ok(versions(db).includes(n), String(n));
      assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ops_allocation_rules`).get() as { n: number }).n, 0);
      const file = process.env.DATABASE_PATH!;
      closeDb();
      if (fixture) assert.deepEqual(protectedSnapshot(file), beforeFixture);
      process.env.DATABASE_PATH = ORIGINAL_PATH;
    }
  } finally {
    closeDb();
    process.env.DATABASE_PATH = ORIGINAL_PATH;
  }
});

test("reversa 026 borra la asignación y conserva 022, 023, 024, 025 y 027", () => {
  const db = openCopy("produccion-v14.sqlite");
  const file = process.env.DATABASE_PATH!;
  try {
    assert.ok(hasTable(db, "ops_allocation_rules"));
    assert.ok(hasTable(db, "ops_jobs"));
    const before = {
      users: db.prepare(`SELECT * FROM users ORDER BY id`).all(),
      loads: db.prepare(`SELECT * FROM loads ORDER BY id`).all(),
      offers: db.prepare(`SELECT * FROM offers ORDER BY id`).all(),
    };
    db.exec(fs.readFileSync(path.join(process.cwd(), "docs/migrations/026-ops-asignacion-rollback.sql"), "utf8"));
    for (const table of ["ops_allocation_rules", "ops_allocation_runs", "ops_allocation_candidates", "ops_allocation_decisions", "ops_jobs"]) {
      assert.equal(hasTable(db, table), false, table);
    }
    assert.equal(versions(db).includes(26), false);
    for (const n of [22, 23, 24, 25, 27]) assert.ok(versions(db).includes(n), String(n));
    assert.equal(Math.max(...versions(db)), 27);
    assert.ok(hasTable(db, "ops_organizations"));
    assert.ok(hasTable(db, "ops_shipments"));
    assert.ok(hasTable(db, "ops_zones"));
    assert.ok(hasTable(db, "ops_carrier_scores"));
    assert.ok(hasTable(db, "ops_telematics_sources"));
    assert.deepEqual(db.prepare(`SELECT * FROM users ORDER BY id`).all(), before.users);
    assert.deepEqual(db.prepare(`SELECT * FROM loads ORDER BY id`).all(), before.loads);
    assert.deepEqual(db.prepare(`SELECT * FROM offers ORDER BY id`).all(), before.offers);
  } finally {
    closeDb();
    process.env.DATABASE_PATH = file;
    assertFinalSchema(getDb());
    closeDb();
    process.env.DATABASE_PATH = ORIGINAL_PATH;
  }
});
