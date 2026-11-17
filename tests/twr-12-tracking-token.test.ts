import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { tokenHash, registerUser, upsertAdmin } from "../src/lib/auth";
import { closeDb, getDb, MIGRATION_33_SQL } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { todayChile, rutDv } from "../src/lib/format";
import { createLoad } from "../src/lib/listings";
import { ensureShipmentForLoad } from "../src/lib/ops/shipments";
import { issueTrackingLink, readTracking } from "../src/lib/ops/tracking";
import type { PublicUser } from "../src/lib/types";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

let seq = 0;

function nextRut(): string {
  seq += 1;
  const body = String(21_400_000 + seq * 149).padStart(8, "0");
  return `${body}-${rutDv(body)}`;
}

function addDays(days: number): string {
  const [year, month, day] = todayChile().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function person(tag: string): PublicUser {
  const { user } = registerUser({
    role: "mandante",
    razonSocial: `Mandante ${tag}`,
    rut: nextRut(),
    contactName: `Contacto ${tag}`,
    email: `${tag}-${seq}@twr-12.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(48000000 + seq).padStart(8, "0")}`,
    city: "La Serena",
  });
  return user;
}

function sqlBody(text: string) {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

function notFound(error: unknown) {
  return error instanceof AppError && error.status === 404;
}

test("TWR-12: no hay token en claro en la base ni en la auditoría, y un token distinto no coincide", () => {
  const doc = fs.readFileSync(path.join(__dirname, "../docs/migrations/033-tracking-token-hash.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(__dirname, "../docs/migrations/033-tracking-token-hash-rollback.sql"), "utf8");
  assert.equal(sqlBody(doc), sqlBody(MIGRATION_33_SQL));
  assert.match(rollback, /ALTER TABLE ops_tracking_links DROP COLUMN token_hash/);
  assert.match(rollback, /DELETE FROM schema_migrations WHERE version = 33/);

  const owner = person("duena");
  const admin = upsertAdmin({
    email: `admin-twr12-${seq}@twr-12.test`,
    password: "Camino-Largo-2026",
    razonSocial: "Admin seguimiento",
    rut: nextRut(),
    contactName: "Admin",
    whatsapp: `+56 9 ${String(48100000 + seq).padStart(8, "0")}`,
    city: "Santiago",
  });
  const load = createLoad(owner, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(4),
    equipment: "rampla_plana",
    description: "Carga del enlace público",
    weightT: 8,
    specs: {},
  });
  const shipment = ensureShipmentForLoad(load.id, admin);
  const issued = issueTrackingLink(admin, shipment.id);
  if (!issued.created) throw new Error("no se emitió el enlace");
  const token = issued.token;
  const other = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.notEqual(other, token);

  const db = getDb();
  const row = db.prepare(`SELECT token, token_hash FROM ops_tracking_links WHERE shipment_id = ?`).get(shipment.id) as {
    token: string;
    token_hash: string;
  };
  const hash = tokenHash(token);
  assert.equal(row.token_hash, hash);
  assert.equal(row.token, hash);
  assert.notEqual(row.token, token);
  assert.notEqual(row.token_hash, token);
  assert.equal(JSON.stringify(row).includes(token), false);

  const audits = db.prepare(`SELECT action, detail, target_id FROM audit_log WHERE action = 'ops.seguimiento_emitido'`).all() as {
    action: string;
    detail: string | null;
    target_id: string | null;
  }[];
  assert.equal(audits.length, 1);
  const detail = JSON.parse(audits[0].detail ?? "{}") as { prefijo?: string; token?: unknown };
  assert.equal(detail.token, undefined);
  assert.equal(detail.prefijo, token.slice(0, 6));
  assert.equal(detail.prefijo.length, 6);
  assert.equal(JSON.stringify(audits).includes(token), false);
  assert.equal(audits[0].target_id, shipment.id);

  const view = readTracking(token);
  assert.equal(view.origin, "La Serena");
  assert.equal(view.destination, "Santiago");
  assert.throws(() => readTracking(other), notFound);

  const repeat = issueTrackingLink(admin, shipment.id);
  assert.equal(repeat.created, false);
  assert.equal("token" in repeat, false);
  assert.equal(JSON.stringify(repeat).includes(token), false);
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'ops.seguimiento_emitido'`).get() as { n: number }).n,
    1,
  );

  const legacy = "legado-en-claro-abcXYZ_12";
  const legacyOther = "legado-en-claro-abcXYZ_99";
  db.exec(rollback);
  const shipmentId = "22222222-2222-4222-8222-222222222222";
  const stamp = "2026-06-01T00:00:00.000Z";
  db.prepare(
    `INSERT INTO ops_shipments (
      id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id,
      stage, planned_pickup_at, planned_delivery_at, created_at, updated_at
    ) VALUES (?, NULL, NULL, NULL, NULL, NULL, NULL, 'ejecucion', NULL, NULL, ?, ?)`,
  ).run(shipmentId, stamp, stamp);
  db.prepare(`INSERT INTO ops_tracking_links (token, shipment_id, created_at) VALUES (?, ?, ?)`).run(legacy, shipmentId, stamp);
  assert.deepEqual(db.prepare(`SELECT token FROM ops_tracking_links WHERE shipment_id = ?`).get(shipmentId), { token: legacy });
  closeDb();
  const migrated = getDb();
  const converted = migrated.prepare(`SELECT token, token_hash FROM ops_tracking_links WHERE shipment_id = ?`).get(shipmentId) as {
    token: string;
    token_hash: string;
  };
  assert.equal(converted.token_hash, tokenHash(legacy));
  assert.equal(converted.token, tokenHash(legacy));
  assert.equal(JSON.stringify(converted).includes(legacy), false);
  const kept = migrated.prepare(`SELECT token, token_hash FROM ops_tracking_links WHERE shipment_id = ?`).get(shipment.id) as {
    token: string;
    token_hash: string;
  };
  assert.equal(kept.token_hash, hash);
  assert.equal(readTracking(token).origin, "La Serena");
  assert.equal(readTracking(legacy).stage, "ejecucion");
  assert.throws(() => readTracking(other), notFound);
  assert.throws(() => readTracking(legacyOther), notFound);
  const auditAfter = JSON.stringify(migrated.prepare(`SELECT detail FROM audit_log`).all());
  assert.equal(auditAfter.includes(token), false);
  assert.equal(auditAfter.includes(legacy), false);
});
