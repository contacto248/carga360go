import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { PATCH } from "../src/app/api/admin/parametros-flete/route";
import { GET as getEstimacion } from "../src/app/api/estimacion/route";
import { GET as getParametros } from "../src/app/api/estimacion/parametros/route";
import { createSession, upsertAdmin } from "../src/lib/auth";
import { closeDb, getDb, MIGRATION_14_USER_COLUMNS, MIGRATION_15_SQL, MIGRATION_15_TABLES, MIGRATION_16_SQL, MIGRATION_16_TABLES } from "../src/lib/db";
import { readFreightConfig, updateFreightConfig } from "../src/lib/freight-cost";
import { DEFAULT_RATES, MIN_TRIP_CLP, ROAD_FACTOR } from "../src/lib/freight-defaults";
import { roadKm } from "../src/lib/geo";
import { estimateByKm } from "../src/lib/pricing";
import { EQUIPMENT_IDS } from "../src/lib/types";

const ORIGINAL = process.env.DATABASE_PATH;
const ctx = { params: Promise.resolve({}) };

function useTemp(): string {
  closeDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c360-mig16-"));
  const file = path.join(dir, "db.sqlite");
  process.env.DATABASE_PATH = file;
  return file;
}

function restore() {
  closeDb();
  process.env.DATABASE_PATH = ORIGINAL;
}

function versions(db: Database.Database): number[] {
  return (db.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as { version: number }[]).map((row) => row.version);
}

function hasTable(db: Database.Database, name: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

function seedUserAndLoad(db: Database.Database) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, razon_social, rut, rut_norm, contact_name, whatsapp, city, created_at)
     VALUES ('u1', 'mandante@mig.test', 'x', 'mandante', 'Mig Norte', '1-9', '19', 'Ana', '56911111111', 'Santiago', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO loads (id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, created_at, updated_at)
     VALUES ('l1', 'u1', 'Santiago', 'Concepción', '2026-12-01', 'rampla_plana', 'Cobre', 20, ?, ?)`,
  ).run(now, now);
}

function snapshot(db: Database.Database) {
  return {
    user: db.prepare(`SELECT id, email, rut, city, role FROM users WHERE id = 'u1'`).get(),
    load: db.prepare(`SELECT id, origin, destination, equipment, weight_t FROM loads WHERE id = 'l1'`).get(),
  };
}

function downgradeTo13(file: string) {
  const raw = new Database(file);
  raw.pragma("foreign_keys = OFF");
  raw.exec(`DROP INDEX IF EXISTS idx_users_manual_readonly`);
  for (const column of [...MIGRATION_14_USER_COLUMNS].reverse()) raw.exec(`ALTER TABLE users DROP COLUMN ${column}`);
  for (const table of ["agent_otp_challenges", "load_tracking_codes", "agent_leads", "agent_messages", "agent_conversations", ...[...MIGRATION_16_TABLES].reverse()]) {
    raw.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  raw.prepare(`DELETE FROM schema_migrations WHERE version >= 14`).run();
  raw.close();
}

test("base nueva: 14, 15 y 16 en orden, semilla y segunda apertura sin duplicar", () => {
  const file = useTemp();
  try {
    const db = getDb();
    const applied = db.prepare(`SELECT version, applied_at FROM schema_migrations WHERE version IN (14, 15, 16) ORDER BY version`).all() as {
      version: number;
      applied_at: string;
    }[];
    assert.deepEqual(applied.map((row) => row.version), [14, 15, 16]);
    assert.ok(applied[0].applied_at <= applied[1].applied_at && applied[1].applied_at <= applied[2].applied_at);
    for (const table of [...MIGRATION_15_TABLES, ...MIGRATION_16_TABLES]) assert.equal(hasTable(db, table), true, table);
    const userCols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((column) => column.name);
    for (const column of MIGRATION_14_USER_COLUMNS) assert.ok(userCols.includes(column), column);
    const otpCols = (db.prepare(`PRAGMA table_info(agent_otp_challenges)`).all() as { name: string }[]).map((column) => column.name);
    for (const column of ["id", "conversation_id", "load_id", "channel", "code_hash", "attempts", "expires_at", "used_at", "created_at"]) {
      assert.ok(otpCols.includes(column), column);
    }
    assert.deepEqual(Object.keys(DEFAULT_RATES).sort(), [...EQUIPMENT_IDS].sort());
    const rates = db.prepare(`SELECT COUNT(*) AS n FROM freight_km_rates`).get() as { n: number };
    assert.equal(rates.n, EQUIPMENT_IDS.length);
    const factor = db.prepare(`SELECT value_real FROM freight_cost_settings WHERE key = 'road_factor'`).get() as { value_real: number };
    assert.equal(factor.value_real, ROAD_FACTOR);
    const liviano = db.prepare(`SELECT value_real FROM freight_cost_settings WHERE key = 'min_trip_liviano'`).get() as { value_real: number };
    const pesado = db.prepare(`SELECT value_real FROM freight_cost_settings WHERE key = 'min_trip_pesado'`).get() as { value_real: number };
    assert.equal(liviano.value_real, MIN_TRIP_CLP.liviano);
    assert.equal(pesado.value_real, MIN_TRIP_CLP.pesado);
    const audits = db.prepare(`SELECT COUNT(*) AS n FROM freight_param_audit WHERE actor_email = 'sistema' AND old_value IS NULL`).get() as { n: number };
    assert.equal(audits.n, 3 + EQUIPMENT_IDS.length);
    assert.equal((db.prepare(`PRAGMA integrity_check`).get() as { integrity_check: string }).integrity_check, "ok");
    db.exec(MIGRATION_15_SQL);
    db.exec(MIGRATION_16_SQL);
    db.exec(fs.readFileSync(path.join(process.cwd(), "docs/migrations/015-agente-comercial.sql"), "utf8"));
    db.exec(fs.readFileSync(path.join(process.cwd(), "docs/migrations/016-parametros-flete.sql"), "utf8"));
    const firstAudits = audits.n;
    const firstVersions = versions(db);
    closeDb();
    process.env.DATABASE_PATH = file;
    const again = getDb();
    assert.deepEqual(versions(again), firstVersions);
    assert.deepEqual(versions(again).filter((version) => version >= 14), [14, 15, 16]);
    assert.equal((again.prepare(`SELECT COUNT(*) AS n FROM freight_param_audit`).get() as { n: number }).n, firstAudits);
    assert.equal((again.prepare(`SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 15`).get() as { n: number }).n, 1);
  } finally {
    restore();
  }
});

test("desde la versión 13 conserva usuarios y cargas, y repara la 14 alternativa", () => {
  const file = useTemp();
  try {
    const db = getDb();
    seedUserAndLoad(db);
    const before = snapshot(db);
    closeDb();
    downgradeTo13(file);
    const raw = new Database(file);
    assert.equal((raw.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as { v: number }).v, 13);
    raw.close();
    process.env.DATABASE_PATH = file;
    const upgraded = getDb();
    assert.deepEqual(snapshot(upgraded), before);
    const user = upgraded.prepare(`SELECT backup_contact, manual_readonly_until FROM users WHERE id = 'u1'`).get() as {
      backup_contact: string | null;
      manual_readonly_until: string | null;
    };
    assert.equal(user.backup_contact, null);
    assert.equal(user.manual_readonly_until, null);
    assert.ok(versions(upgraded).includes(16));
    closeDb();

    downgradeTo13(file);
    const alt = new Database(file);
    alt.pragma("foreign_keys = OFF");
    alt.exec(`ALTER TABLE users ADD COLUMN ingreso_sin_documentos INTEGER NOT NULL DEFAULT 0`);
    alt.prepare(`UPDATE users SET ingreso_sin_documentos = 1 WHERE id = 'u1'`).run();
    const stamp = "2026-11-13T16:00:00.000Z";
    alt.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (14, ?)`).run(stamp);
    alt.close();
    process.env.DATABASE_PATH = file;
    const reconciled = getDb();
    const kept = reconciled.prepare(`SELECT ingreso_sin_documentos AS flag, backup_contact FROM users WHERE id = 'u1'`).get() as {
      flag: number;
      backup_contact: string | null;
    };
    assert.equal(kept.flag, 1);
    assert.equal(kept.backup_contact, null);
    assert.deepEqual(snapshot(reconciled), before);
    assert.deepEqual(reconciled.prepare(`SELECT applied_at FROM schema_migrations WHERE version = 14`).all(), [{ applied_at: stamp }]);
    assert.equal((reconciled.prepare(`SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 14`).get() as { n: number }).n, 1);
    closeDb();
    process.env.DATABASE_PATH = file;
    getDb();
    const reopened = new Database(file, { readonly: true });
    assert.deepEqual(reopened.prepare(`SELECT applied_at FROM schema_migrations WHERE version = 14`).all(), [{ applied_at: stamp }]);
    reopened.close();
  } finally {
    restore();
  }
});

test("si faltan tablas de la 15, se vuelven a crear sin duplicar la versión", () => {
  const file = useTemp();
  try {
    const db = getDb();
    db.pragma("foreign_keys = OFF");
    db.exec(`DROP TABLE agent_otp_challenges`);
    db.exec(`DROP TABLE load_tracking_codes`);
    closeDb();
    process.env.DATABASE_PATH = file;
    const again = getDb();
    assert.equal(hasTable(again, "load_tracking_codes"), true);
    assert.equal(hasTable(again, "agent_otp_challenges"), true);
    assert.equal((again.prepare(`SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 15`).get() as { n: number }).n, 1);
  } finally {
    restore();
  }
});

test("el cambio de parámetro queda auditado y /api/estimacion lo usa; si falta la fila, respalda y la semilla vuelve", async () => {
  const file = useTemp();
  try {
    const config = readFreightConfig();
    assert.equal(config.fuente, "base");
    assert.equal(config.factorRuta, 1.25);
    const km = roadKm("Santiago", "Concepción", config.factorRuta)!;
    const esperado = estimateByKm(km, "rampla_plana", {
      rates: config.tarifas,
      minLiviano: config.minimoLiviano,
      minPesado: config.minimoPesado,
      soloEstasTarifas: true,
    });
    assert.equal(esperado!.rateMin, 900);
    assert.equal(estimateByKm(1000, "rampla_plana")!.min, 900_000);
    assert.equal(estimateByKm(20, "rampla_plana")!.min, 120_000);

    const url = new URL("http://127.0.0.1:4317/api/estimacion");
    url.searchParams.set("origen", "Santiago");
    url.searchParams.set("destino", "Concepción");
    url.searchParams.set("equipo", "rampla_plana");
    const response = await getEstimacion(new Request(url), ctx);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { km: number; fuente: string; estimate: { min: number; max: number; rateMin: number; rateMax: number } };
    assert.equal(body.fuente, "base");
    assert.equal(body.km, km);
    assert.equal(body.estimate.min, esperado!.min);
    assert.equal(body.estimate.max, esperado!.max);

    const admin = { id: "admin-1", email: "admin@mig.test" };
    updateFreightConfig(admin, { factorRuta: 1.5, tarifas: { rampla_plana: [1000, 2000] } });
    const changed = readFreightConfig();
    assert.equal(changed.factorRuta, 1.5);
    assert.deepEqual(changed.tarifas.rampla_plana, [1000, 2000]);
    const km2 = roadKm("Santiago", "Concepción", 1.5)!;
    assert.ok(km2 > km);
    const quote2 = estimateByKm(km2, "rampla_plana", {
      rates: changed.tarifas,
      minLiviano: changed.minimoLiviano,
      minPesado: changed.minimoPesado,
      soloEstasTarifas: true,
    })!;
    const response2 = await getEstimacion(new Request(url), ctx);
    const body2 = (await response2.json()) as { km: number; estimate: { min: number; rateMin: number; rateMax: number } };
    assert.equal(body2.km, km2);
    assert.equal(body2.estimate.rateMin, 1000);
    assert.equal(body2.estimate.rateMax, 2000);
    assert.equal(body2.estimate.min, quote2.min);

    const rows = getDb().prepare(`SELECT param_key, old_value, new_value, actor_id, actor_email FROM freight_param_audit WHERE actor_id = ? ORDER BY param_key`).all(admin.id) as {
      param_key: string;
      old_value: string;
      new_value: string;
      actor_id: string;
      actor_email: string;
    }[];
    assert.deepEqual(rows, [
      { param_key: "road_factor", old_value: "1.25", new_value: "1.5", actor_id: admin.id, actor_email: admin.email },
      { param_key: "tarifa:rampla_plana", old_value: "900,1500", new_value: "1000,2000", actor_id: admin.id, actor_email: admin.email },
    ]);

    closeDb();
    process.env.DATABASE_PATH = file;
    getDb();
    assert.equal((getDb().prepare(`SELECT rate_min FROM freight_km_rates WHERE equipment = 'rampla_plana'`).get() as { rate_min: number }).rate_min, 1000);

    getDb().prepare(`DELETE FROM freight_km_rates WHERE equipment = 'cama_baja'`).run();
    const fallback = readFreightConfig();
    assert.equal(fallback.fuente, "respaldo");
    assert.deepEqual(fallback.tarifas.cama_baja, [2000, 3500]);
    const camaUrl = new URL(url);
    camaUrl.searchParams.set("equipo", "cama_baja");
    const cama = (await (await getEstimacion(new Request(camaUrl), ctx)).json()) as { fuente: string; estimate: { rateMin: number } };
    assert.equal(cama.fuente, "respaldo");
    assert.equal(cama.estimate.rateMin, 2000);

    closeDb();
    process.env.DATABASE_PATH = file;
    getDb();
    const restored = getDb().prepare(`SELECT rate_min, rate_max FROM freight_km_rates WHERE equipment = 'cama_baja'`).get() as { rate_min: number; rate_max: number };
    assert.deepEqual(restored, { rate_min: 2000, rate_max: 3500 });
    const seedAudits = getDb().prepare(`SELECT COUNT(*) AS n FROM freight_param_audit WHERE param_key = 'tarifa:cama_baja' AND actor_email = 'sistema'`).get() as { n: number };
    assert.equal(seedAudits.n, 2);
    assert.equal((getDb().prepare(`SELECT rate_min FROM freight_km_rates WHERE equipment = 'rampla_plana'`).get() as { rate_min: number }).rate_min, 1000);
  } finally {
    restore();
  }
});

test("el administrador cambia parámetros por la API; otro rol y un campo ajeno se rechazan", async () => {
  useTemp();
  try {
    const admin = upsertAdmin({
      email: "parametros@mig.test",
      password: "Admin-Clave-Larga-2026",
      razonSocial: "Admin Mig",
      rut: "11.111.111-1",
      contactName: "Admin",
      whatsapp: "+56 9 1000 0001",
      city: "Santiago",
    });
    const token = createSession(admin.id, { mfa: true });
    const headers = new Headers({
      "content-type": "application/json",
      cookie: `c360_session=${token}`,
      "sec-fetch-site": "same-origin",
      host: "127.0.0.1:4317",
      "x-real-ip": "203.0.113.40",
    });
    const denied = await PATCH(
      new Request("http://127.0.0.1:4317/api/admin/parametros-flete", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ comision: 10 }),
      }),
      ctx,
    );
    assert.equal(denied.status, 400);
    const same = await PATCH(
      new Request("http://127.0.0.1:4317/api/admin/parametros-flete", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ factorRuta: 1.25 }),
      }),
      ctx,
    );
    assert.equal(same.status, 400);

    const ok = await PATCH(
      new Request("http://127.0.0.1:4317/api/admin/parametros-flete", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ minimoPesado: 130000 }),
      }),
      ctx,
    );
    assert.equal(ok.status, 200, await ok.clone().text());
    const saved = (await ok.json()) as { parametros: { minimoPesado: number } };
    assert.equal(saved.parametros.minimoPesado, 130000);
    const audit = getDb().prepare(`SELECT old_value, new_value, actor_email FROM freight_param_audit WHERE param_key = 'min_trip_pesado' AND actor_id = ?`).get(admin.id) as {
      old_value: string;
      new_value: string;
      actor_email: string;
    };
    assert.deepEqual(audit, { old_value: "120000", new_value: "130000", actor_email: admin.email });

    const publico = await getParametros(new Request("http://127.0.0.1:4317/api/estimacion/parametros"), ctx);
    const params = (await publico.json()) as { minimoPesado: number; fuente: string };
    assert.equal(params.minimoPesado, 130000);
    assert.equal(params.fuente, "base");

    const stranger = await PATCH(
      new Request("http://127.0.0.1:4317/api/admin/parametros-flete", {
        method: "PATCH",
        headers: new Headers({ "content-type": "application/json", "sec-fetch-site": "same-origin", host: "127.0.0.1:4317" }),
        body: JSON.stringify({ minimoPesado: 140000 }),
      }),
      ctx,
    );
    assert.equal(stranger.status, 401);
    assert.equal((getDb().prepare(`SELECT value_real FROM freight_cost_settings WHERE key = 'min_trip_pesado'`).get() as { value_real: number }).value_real, 130000);
  } finally {
    restore();
  }
});
