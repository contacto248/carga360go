import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { GET as getRuns, POST as postRun } from "../src/app/api/ops/asignacion/route";
import { POST as postConfirm } from "../src/app/api/ops/asignacion/[runId]/confirmar/route";
import { POST as postRule } from "../src/app/api/ops/reglas/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { REQUIRED_CARRIER_DOCS } from "../src/lib/carrier";
import { getDb } from "../src/lib/db";
import { rutDv, todayChile } from "../src/lib/format";
import { carrierCapacity } from "../src/lib/ops/capacity";
import { createRule, confirmAllocation, processOpsJobs, proposeAllocation, retryDelayMs, TRACE_VERSION } from "../src/lib/ops/allocation";
import { OPS_FLAGS } from "../src/lib/ops/flags";
import { privacyVersion, termsVersion } from "../src/lib/privacy";
import { ensureShipmentForLoad, verifyChain } from "../src/lib/ops/shipments";
import type { PublicUser } from "../src/lib/types";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

const ctx = { params: Promise.resolve({}) };
let seq = 81_000_000;

function rut() {
  seq += 1;
  const body = String(seq);
  return `${body}-${rutDv(body)}`;
}

function withOps(on: boolean, auto = false) {
  for (const flag of OPS_FLAGS) delete process.env[flag];
  if (!on) return;
  process.env.OPS_FEATURE_ENABLED = "true";
  process.env.OPS_ALLOCATION_ENABLED = "true";
  if (auto) process.env.OPS_ALLOCATION_AUTO = "true";
}

function person(role: "mandante" | "transportista", tag: string) {
  return registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: tag,
    email: `${tag}-${seq}@ops-asig.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 6111 2345",
    city: "Santiago",
  }).user;
}

function admin(tag: string) {
  return upsertAdmin({
    email: `${tag}-${seq}@ops-asig.test`,
    password: "Camino-Largo-2026",
    razonSocial: `Admin ${tag}`,
    rut: rut(),
    contactName: tag,
    whatsapp: "+56 9 4444 5555",
    city: "Santiago",
  });
}

function accredit(id: string) {
  const db = getDb();
  const stamp = new Date().toISOString();
  db.prepare(
    `UPDATE users SET email_verified_at = ?, verification_status = 'verificado', phone_verified_at = ?, privacy_version = ?, privacy_accepted_at = ?, terms_version = ?, terms_accepted_at = ?, req_calidad = 'cumple', req_seguridad = 'cumple', req_medioambiente = 'no_aplica' WHERE id = ?`,
  ).run(stamp, stamp, privacyVersion(), stamp, termsVersion(), stamp, id);
  for (const type of REQUIRED_CARRIER_DOCS) {
    db.prepare(
      `INSERT INTO documents (id, user_id, audience, type, holder_name, expiry, verification_status, created_at) VALUES (?, ?, ?, ?, 'Prueba', '2099-01-01', 'verificado', ?)`,
    ).run(randomUUID(), id, ["cedula", "licencia"].includes(type) ? "personal" : "camion", type, stamp);
  }
}

function addDays(days: number) {
  const [y, m, d] = todayChile().split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function call(method: string, url: string, token?: string, body?: unknown) {
  const headers = new Headers({ host: "127.0.0.1:4317" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token && method !== "GET") headers.set("sec-fetch-site", "same-origin");
  if (token) headers.set("cookie", `${COOKIE_NAME}=${token}`);
  return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function org(kind: "mandante" | "transportista", ownerId: string) {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO ops_organizations (id, kind, razon_social, rut_norm, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, kind, `Org ${kind} ${seq}`, `ops203-${seq}-${id.slice(0, 8)}`, ownerId, stamp, stamp);
  return id;
}

function member(orgId: string, userId: string) {
  getDb()
    .prepare(`INSERT INTO ops_org_members (id, org_id, user_id, area, ops_role, status, created_at) VALUES (?, ?, ?, NULL, 'org_admin', 'activo', ?)`)
    .run(randomUUID(), orgId, userId, new Date().toISOString());
}

function truck(ownerId: string, origin: string, destination: string) {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO trucks (id, owner_id, origin, destination, available_from, available_to, equipment, tonnage, specs_json, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, '2020-01-01', '2099-12-31', 'sider', 40, '{}', 0, ?, ?)`,
    )
    .run(id, ownerId, origin, destination, stamp, stamp);
  return id;
}

function load(ownerId: string, origin: string, destination: string) {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO loads (
         id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, specs_json,
         is_demo, created_at, updated_at, status
       ) VALUES (?, ?, ?, ?, ?, 'sider', 'Carga de prueba de asignación', 20, '{}', 0, ?, ?, 'abierta')`,
    )
    .run(id, ownerId, origin, destination, addDays(3), stamp, stamp);
  return id;
}

function score(carrierId: string, value: number) {
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO ops_carrier_scores (
         id, carrier_user_id, carrier_org_id, period_start, period_end, trips_done, on_time_pct, cancel_count,
         incident_count, avg_rating, docs_valid, score, level, rules_version, computed_at
       ) VALUES (?, ?, NULL, '2026-01-01', '2026-12-31', 1, NULL, 0, 0, NULL, 1, ?, 'revisar', 'ops-203-test', ?)`,
    )
    .run(randomUUID(), carrierId, value, stamp);
}

function tariff(shipperOrgId: string, carrierOrgId: string, origin: string, destination: string, amount: number) {
  const db = getDb();
  const stamp = new Date().toISOString();
  const originId = randomUUID();
  const destinationId = randomUUID();
  db.prepare(`INSERT INTO ops_zones (id, org_id, name, comunas_json, region, created_at) VALUES (?, ?, ?, '[]', NULL, ?)`).run(originId, shipperOrgId, origin, stamp);
  const existingDest = db.prepare(`SELECT id FROM ops_zones WHERE org_id = ? AND name = ?`).get(shipperOrgId, destination) as { id: string } | undefined;
  const destId = existingDest?.id ?? destinationId;
  if (!existingDest) {
    db.prepare(`INSERT INTO ops_zones (id, org_id, name, comunas_json, region, created_at) VALUES (?, ?, ?, '[]', NULL, ?)`).run(destId, shipperOrgId, destination, stamp);
  }
  const existingOrigin = db.prepare(`SELECT id FROM ops_zones WHERE org_id = ? AND name = ? AND id <> ?`).get(shipperOrgId, origin, originId) as { id: string } | undefined;
  const fromId = existingOrigin?.id ?? originId;
  if (existingOrigin) db.prepare(`DELETE FROM ops_zones WHERE id = ?`).run(originId);
  let lane = db.prepare(`SELECT id FROM ops_lanes WHERE org_id = ? AND origin_zone_id = ? AND destination_zone_id = ?`).get(shipperOrgId, fromId, destId) as { id: string } | undefined;
  if (!lane) {
    const laneId = randomUUID();
    db.prepare(`INSERT INTO ops_lanes (id, org_id, origin_zone_id, destination_zone_id, distance_km, created_at) VALUES (?, ?, ?, ?, NULL, ?)`).run(
      laneId,
      shipperOrgId,
      fromId,
      destId,
      stamp,
    );
    lane = { id: laneId };
  }
  const cardId = randomUUID();
  db.prepare(
    `INSERT INTO ops_rate_cards (
       id, contract_id, shipper_org_id, carrier_org_id, name, status, valid_from, valid_to, version, approved_by, approved_at, created_at, updated_at
     ) VALUES (?, NULL, ?, ?, 'Tarifa prueba', 'vigente', '2020-01-01', '2099-12-31', 1, NULL, NULL, ?, ?)`,
  ).run(cardId, shipperOrgId, carrierOrgId, stamp, stamp);
  db.prepare(
    `INSERT INTO ops_rate_card_lines (id, rate_card_id, lane_id, equipment, vehicle_class, rate_kind, amount_clp, min_charge_clp, notes)
     VALUES (?, ?, ?, 'sider', NULL, 'por_viaje', ?, NULL, NULL)`,
  ).run(randomUUID(), cardId, lane.id, amount);
}

function busy(carrierId: string, ownerId: string) {
  const loadId = randomUUID();
  const offerId = randomUUID();
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO loads (
       id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, specs_json,
       is_demo, created_at, updated_at, status, awarded_offer_id, trip_status
     ) VALUES (?, ?, 'Otro origen', 'Otro destino', ?, 'sider', 'Viaje en curso', 10, '{}', 1, ?, ?, 'adjudicada', ?, 'en_camino')`,
  ).run(loadId, ownerId, addDays(1), stamp, stamp, offerId);
  db.prepare(
    `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, revisions, created_at, updated_at) VALUES (?, ?, ?, 1000, ?, 'aceptada', 0, ?, ?)`,
  ).run(offerId, loadId, carrierId, addDays(1), stamp, stamp);
}

type Scene = {
  admin: PublicUser;
  owner: PublicUser;
  shipperOrgId: string;
  origin: string;
  destination: string;
  loadId: string;
  shipmentId: string;
  low: PublicUser;
  high: PublicUser;
};

function scene(tag: string, opts: { lowScore?: number; highScore?: number; lowRate?: number; highRate?: number; busyLow?: boolean } = {}): Scene {
  const boss = admin(tag);
  const owner = person("mandante", `${tag}-manda`);
  const low = person("transportista", `${tag}-bajo`);
  const high = person("transportista", `${tag}-alto`);
  accredit(low.id);
  accredit(high.id);
  const origin = `Origen ${tag} ${seq}`;
  const destination = `Destino ${tag} ${seq}`;
  const shipperOrgId = org("mandante", boss.id);
  const lowOrg = org("transportista", low.id);
  const highOrg = org("transportista", high.id);
  member(lowOrg, low.id);
  member(highOrg, high.id);
  truck(low.id, origin, destination);
  truck(high.id, origin, destination);
  score(low.id, opts.lowScore ?? 60);
  score(high.id, opts.highScore ?? 90);
  tariff(shipperOrgId, lowOrg, origin, destination, opts.lowRate ?? 400000);
  tariff(shipperOrgId, highOrg, origin, destination, opts.highRate ?? 800000);
  if (opts.busyLow) busy(low.id, owner.id);
  const loadId = load(owner.id, origin, destination);
  const shipmentId = ensureShipmentForLoad(loadId, boss).id;
  return { admin: boss, owner, shipperOrgId, origin, destination, loadId, shipmentId, low, high };
}

function rule(actor: PublicUser, shipperOrgId: string, mode: "directa" | "por_tarifa" | "por_desempeno" | "cascada", extra: Record<string, unknown> = {}) {
  return createRule(actor, { shipperOrgId, mode, ...extra });
}

test("el motor no escribe cargas ni ofertas por su cuenta y el script no es un cron", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/ops/allocation.ts"), "utf8");
  const jobs = fs.readFileSync(path.join(process.cwd(), "scripts/ops-jobs.ts"), "utf8");
  assert.doesNotMatch(src, /UPDATE\s+(loads|offers)\b/i);
  assert.doesNotMatch(src, /INSERT\s+INTO\s+(loads|offers)\b/i);
  assert.equal(src.includes("sendEmail"), false);
  assert.equal(src.includes("nodemailer"), false);
  assert.match(src, /acceptOffer/);
  assert.match(src, /submitOffer/);
  assert.match(jobs, /no es un cron/);
  assert.equal(jobs.includes("sendEmail"), false);
  assert.equal(jobs.includes("nodemailer"), false);
  const off = spawnSync(process.execPath, ["--import", "tsx", "scripts/ops-jobs.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, OPS_FEATURE_ENABLED: "false", OPS_ALLOCATION_ENABLED: "false" },
    encoding: "utf8",
  });
  assert.notEqual(off.status, 0);
  assert.match(`${off.stderr}`, /no es un cron/);
});

test("con el flag apagado la API y la página responden 404", async () => {
  withOps(false);
  const denied = await getRuns(call("GET", "http://127.0.0.1:4317/api/ops/asignacion"), ctx);
  assert.equal(denied.status, 404);
  const page = (await import("../src/app/admin/ops/asignacion/page")).default;
  await assert.rejects(page, (error: unknown) => {
    const text = error instanceof Error ? `${error.message} ${String((error as { digest?: string }).digest ?? "")}` : String(error);
    return text.includes("404");
  });
});

test("los pesos deben sumar 1 y la directa exige transportista", () => {
  withOps(true);
  const boss = admin("pesos");
  const shipperOrgId = org("mandante", boss.id);
  assert.throws(
    () => createRule(boss, { shipperOrgId, mode: "cascada", pesos: { costo: 0.5, desempeno: 0.5, capacidad: 0.5, disponibilidad: 0.5 } }),
    /sumar 1/,
  );
  assert.throws(() => createRule(boss, { shipperOrgId, mode: "directa" }), /transportista/);
});

test("por tarifa elige la vigente más baja, por desempeño el mayor puntaje, y hay empate", () => {
  withOps(true, true);
  const priced = scene("tarifa");
  const byRate = proposeAllocation(priced.admin, { shipmentId: priced.shipmentId, ruleId: rule(priced.admin, priced.shipperOrgId, "por_tarifa").id });
  assert.equal(byRate.dryRun, true);
  assert.equal(byRate.status, "propuesta");
  const winner = byRate.candidates.find((candidate) => candidate.rank === 1 && candidate.status === "propuesto");
  assert.equal(winner?.carrierUserId, priced.low.id);
  assert.ok(winner?.reasons.some((reason) => reason.includes("tarifa vigente más baja")));
  assert.equal(byRate.decisions.map((decision) => decision.step).includes("filtrar"), true);
  assert.equal(byRate.decisions.map((decision) => decision.step).includes("ordenar"), true);
  assert.equal(verifyChain(priced.shipmentId).ok, true);
  const loadRow = getDb().prepare(`SELECT status, awarded_offer_id FROM loads WHERE id = ?`).get(priced.loadId) as { status: string; awarded_offer_id: string | null };
  assert.equal(loadRow.status, "abierta");
  assert.equal(loadRow.awarded_offer_id, null);

  const scored = scene("puntaje");
  const byScore = proposeAllocation(scored.admin, {
    shipmentId: scored.shipmentId,
    ruleId: rule(scored.admin, scored.shipperOrgId, "por_desempeno", { minScore: 75 }).id,
  });
  assert.equal(byScore.candidates.find((candidate) => candidate.status === "propuesto")?.carrierUserId, scored.high.id);
  assert.equal(byScore.candidates.find((candidate) => candidate.carrierUserId === scored.low.id)?.status, "descartado");

  const tied = scene("empate", { lowRate: 500000, highRate: 500000, lowScore: 80, highScore: 80 });
  const even = proposeAllocation(tied.admin, { shipmentId: tied.shipmentId, ruleId: rule(tied.admin, tied.shipperOrgId, "por_tarifa").id });
  const order = even.decisions.find((decision) => decision.step === "ordenar")?.output as { empate?: boolean; orden?: string[] };
  assert.equal(order.empate, true);
  const expected = [tied.low.id, tied.high.id].sort();
  assert.deepEqual(order.orden, expected);
});

test("la cascada pondera, invita solo al primero y no adjudica aunque el flag automático esté encendido", () => {
  withOps(true, true);
  const data = scene("cascada");
  const created = rule(data.admin, data.shipperOrgId, "cascada", {
    pesos: { costo: 1, desempeno: 0, capacidad: 0, disponibilidad: 0 },
    maxRounds: 2,
    acceptTimeoutMinutes: 30,
  });
  const run = proposeAllocation(data.admin, { shipmentId: data.shipmentId, ruleId: created.id });
  assert.equal(run.dryRun, true);
  assert.equal(run.status, "en_cascada");
  const invited = run.candidates.filter((candidate) => candidate.status === "invitado");
  assert.equal(invited.length, 1);
  assert.equal(invited[0].carrierUserId, data.low.id);
  for (const step of ["filtrar", "ordenar", "invitar", "esperar", "siguiente"]) {
    assert.equal(run.decisions.some((decision) => decision.step === step), true, step);
  }
  const loadRow = getDb().prepare(`SELECT status FROM loads WHERE id = ?`).get(data.loadId) as { status: string };
  assert.equal(loadRow.status, "abierta");
  const jobs = getDb().prepare(`SELECT COUNT(*) AS n FROM ops_jobs WHERE ref_id = ? AND status = 'pendiente'`).get(invited[0].id) as { n: number };
  assert.equal(jobs.n, 1);
});

test("directa fija al transportista y un no acreditado no aparece", () => {
  withOps(true);
  const data = scene("directa");
  const outsider = person("transportista", "directa-fuera");
  truck(outsider.id, data.origin, data.destination);
  const half = person("transportista", "directa-medio");
  getDb().prepare(`UPDATE users SET verification_status = 'verificado', email_verified_at = ? WHERE id = ?`).run(new Date().toISOString(), half.id);
  truck(half.id, data.origin, data.destination);
  const run = proposeAllocation(data.admin, {
    shipmentId: data.shipmentId,
    ruleId: rule(data.admin, data.shipperOrgId, "directa", { carrierUserId: data.high.id }).id,
  });
  const ids = run.candidates.map((candidate) => candidate.carrierUserId);
  assert.equal(ids.includes(outsider.id), false);
  assert.equal(ids.includes(half.id), false);
  assert.equal(run.candidates.find((candidate) => candidate.status === "propuesto")?.carrierUserId, data.high.id);
  assert.equal(run.candidates.find((candidate) => candidate.carrierUserId === data.low.id)?.status, "descartado");
  const filtrar = run.decisions.find((decision) => decision.step === "filtrar")?.output as { vigentes?: number };
  const dumped = JSON.stringify(run.decisions);
  assert.equal(dumped.includes(outsider.id), false);
  assert.equal(dumped.includes(half.id), false);
  assert.equal(filtrar.vigentes, 1);
});

test("sin candidatos vigentes la propuesta queda agotada y un ocupado se descarta", () => {
  withOps(true);
  const boss = admin("vacio");
  const owner = person("mandante", "vacio-manda");
  const shipperOrgId = org("mandante", boss.id);
  const origin = `Origen vacio ${seq}`;
  const destination = `Destino vacio ${seq}`;
  const loadId = load(owner.id, origin, destination);
  const shipmentId = ensureShipmentForLoad(loadId, boss).id;
  const empty = proposeAllocation(boss, { shipmentId, ruleId: rule(boss, shipperOrgId, "por_tarifa").id });
  assert.equal(empty.status, "agotada");
  assert.equal(empty.candidates.some((candidate) => candidate.status === "propuesto" || candidate.status === "invitado"), false);

  const data = scene("ocupado", { busyLow: true });
  const run = proposeAllocation(data.admin, { shipmentId: data.shipmentId, ruleId: rule(data.admin, data.shipperOrgId, "por_tarifa").id });
  assert.equal(run.candidates.find((candidate) => candidate.carrierUserId === data.low.id)?.status, "descartado");
  assert.match(run.candidates.find((candidate) => candidate.carrierUserId === data.low.id)?.reasons.join(" ") ?? "", /viaje en curso/);
  assert.equal(run.candidates.find((candidate) => candidate.status === "propuesto")?.carrierUserId, data.high.id);
});

test("confirmar usa el flujo de ofertas y no deja la carga abierta", async () => {
  withOps(true);
  const data = scene("confirma");
  const run = proposeAllocation(data.admin, { shipmentId: data.shipmentId, ruleId: rule(data.admin, data.shipperOrgId, "por_tarifa").id });
  const chosen = run.candidates.find((candidate) => candidate.carrierUserId === data.low.id);
  assert.ok(chosen);
  const before = getDb().prepare(`SELECT COUNT(*) AS n FROM offers WHERE load_id = ?`).get(data.loadId) as { n: number };
  assert.equal(before.n, 0);
  const confirmed = await confirmAllocation(data.admin, run.id, chosen.id);
  assert.equal(confirmed.status, "confirmada");
  assert.equal(confirmed.dryRun, true);
  assert.equal(confirmed.candidates.find((candidate) => candidate.id === chosen.id)?.status, "acepto");
  const loadRow = getDb().prepare(`SELECT status, awarded_offer_id FROM loads WHERE id = ?`).get(data.loadId) as { status: string; awarded_offer_id: string };
  assert.equal(loadRow.status, "adjudicada");
  const offer = getDb().prepare(`SELECT carrier_id, status, price_clp FROM offers WHERE id = ?`).get(loadRow.awarded_offer_id) as {
    carrier_id: string;
    status: string;
    price_clp: number;
  };
  assert.equal(offer.carrier_id, data.low.id);
  assert.equal(offer.status, "aceptada");
  assert.equal(offer.price_clp, 400000);
  assert.equal(verifyChain(data.shipmentId).ok, true);
  const audits = getDb().prepare(`SELECT action FROM audit_log WHERE target_id = ? ORDER BY created_at`).all(run.id) as { action: string }[];
  assert.ok(audits.some((row) => row.action === "ops.asignacion_propuesta"));
  assert.ok(audits.some((row) => row.action === "ops.asignacion_confirmada"));
  const events = getDb().prepare(`SELECT kind FROM ops_events WHERE shipment_id = ?`).all(data.shipmentId) as { kind: string }[];
  assert.ok(events.some((row) => row.kind === "asignacion.confirmada"));
});

test("un trabajo que falla se reintenta y queda en error sin frenar al resto; la cascada no duplica invitaciones", () => {
  withOps(true);
  const now = new Date("2026-11-17T15:00:00.000Z");
  const stamp = now.toISOString();
  const db = getDb();
  db.prepare(`UPDATE ops_jobs SET status = 'cancelado', updated_at = ? WHERE status = 'pendiente'`).run(stamp);
  const failId = randomUUID();
  const okId = randomUUID();
  db.prepare(
    `INSERT INTO ops_jobs (id, kind, ref_id, status, attempts, max_attempts, run_after, last_error, created_at, updated_at)
     VALUES (?, 'asignacion.fallo', ?, 'pendiente', 0, 2, ?, NULL, ?, ?)`,
  ).run(failId, randomUUID(), stamp, stamp, stamp);
  db.prepare(
    `INSERT INTO ops_jobs (id, kind, ref_id, status, attempts, max_attempts, run_after, last_error, created_at, updated_at)
     VALUES (?, 'asignacion.vencer', ?, 'pendiente', 0, 3, ?, NULL, ?, ?)`,
  ).run(okId, randomUUID(), stamp, stamp, stamp);
  const first = processOpsJobs({ now, delayMs: () => 0 });
  assert.equal(first.retried, 1);
  assert.equal(first.done, 1);
  const fail = db.prepare(`SELECT status, attempts FROM ops_jobs WHERE id = ?`).get(failId) as { status: string; attempts: number };
  assert.equal(fail.status, "pendiente");
  assert.equal(fail.attempts, 1);
  assert.equal((db.prepare(`SELECT status FROM ops_jobs WHERE id = ?`).get(okId) as { status: string }).status, "hecho");
  const second = processOpsJobs({ now, delayMs: () => 0 });
  assert.equal(second.failed, 1);
  assert.equal((db.prepare(`SELECT status, attempts FROM ops_jobs WHERE id = ?`).get(failId) as { status: string; attempts: number }).status, "error");
  const laterId = randomUUID();
  db.prepare(
    `INSERT INTO ops_jobs (id, kind, ref_id, status, attempts, max_attempts, run_after, last_error, created_at, updated_at)
     VALUES (?, 'asignacion.vencer', ?, 'pendiente', 0, 3, ?, NULL, ?, ?)`,
  ).run(laterId, randomUUID(), stamp, stamp, stamp);
  const third = processOpsJobs({ now });
  assert.equal((db.prepare(`SELECT status FROM ops_jobs WHERE id = ?`).get(laterId) as { status: string }).status, "hecho");
  assert.equal(third.done >= 1, true);
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(2), 120_000);

  const data = scene("reintento");
  const run = proposeAllocation(data.admin, {
    shipmentId: data.shipmentId,
    ruleId: rule(data.admin, data.shipperOrgId, "cascada", { maxRounds: 2, acceptTimeoutMinutes: 15 }).id,
  });
  db.prepare(`UPDATE ops_jobs SET run_after = ? WHERE ref_id = ? AND status = 'pendiente'`).run(stamp, run.candidates.find((candidate) => candidate.status === "invitado")?.id);
  processOpsJobs({ now });
  processOpsJobs({ now });
  const fresh = db.prepare(`SELECT status FROM ops_allocation_candidates WHERE run_id = ?`).all(run.id) as { status: string }[];
  assert.equal(fresh.filter((row) => row.status === "invitado").length, 1);
  assert.equal(fresh.filter((row) => row.status === "vencido").length, 1);
});

test("la API exige el flag y el permiso, y confirma por el mismo flujo", async () => {
  withOps(false);
  const closed = await postRun(call("POST", "http://127.0.0.1:4317/api/ops/asignacion", "x", {}), ctx);
  assert.equal(closed.status, 404);
  withOps(true);
  const data = scene("api");
  const stranger = person("mandante", "api-ajeno");
  const token = createSession(data.admin.id, { mfa: true });
  const created = await postRule(
    call("POST", "http://127.0.0.1:4317/api/ops/reglas", token, { shipperOrgId: data.shipperOrgId, mode: "por_tarifa" }),
    ctx,
  );
  assert.equal(created.status, 201);
  const ruleId = ((await created.json()) as { rule: { id: string } }).rule.id;
  const forbidden = await postRun(
    call("POST", "http://127.0.0.1:4317/api/ops/asignacion", createSession(stranger.id), { shipmentId: data.shipmentId, ruleId }),
    ctx,
  );
  assert.equal(forbidden.status, 403);
  const proposed = await postRun(call("POST", "http://127.0.0.1:4317/api/ops/asignacion", token, { shipmentId: data.shipmentId, ruleId }), ctx);
  assert.equal(proposed.status, 201);
  const body = (await proposed.json()) as { run: { id: string; dryRun: boolean; candidates: { id: string; carrierUserId: string }[] } };
  assert.equal(body.run.dryRun, true);
  const candidateId = body.run.candidates.find((candidate) => candidate.carrierUserId === data.low.id)?.id;
  assert.ok(candidateId);
  const confirmed = await postConfirm(
    call("POST", `http://127.0.0.1:4317/api/ops/asignacion/${body.run.id}/confirmar`, token, { candidateId }),
    { params: Promise.resolve({ runId: body.run.id }) },
  );
  assert.equal(confirmed.status, 200);
  const listed = await getRuns(call("GET", "http://127.0.0.1:4317/api/ops/asignacion", token), ctx);
  assert.equal(listed.status, 200);
  assert.equal((getDb().prepare(`SELECT status FROM loads WHERE id = ?`).get(data.loadId) as { status: string }).status, "adjudicada");
});

test("la capacidad mide la fecha de retiro y separa el código", () => {
  const carrier = person("transportista", "cupo-retiro");
  const owner = person("mandante", "cupo-retiro-manda");
  assert.equal(carrierCapacity(carrier.id, "2026-12-15").reasonCode, "SIN_CAMION");
  assert.equal(carrierCapacity(carrier.id, "2026-12-15").status, "sin_datos");
  const truckId = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO trucks (id, owner_id, origin, destination, available_from, available_to, equipment, tonnage, specs_json, is_demo, created_at, updated_at)
       VALUES (?, ?, 'Calama', 'Antofagasta', '2026-12-01', '2026-12-31', 'sider', 28, '{}', 1, ?, ?)`,
    )
    .run(truckId, carrier.id, stamp, stamp);
  assert.equal(carrierCapacity(carrier.id, "2026-11-17").reasonCode, "FUERA_VENTANA");
  assert.equal(carrierCapacity(carrier.id, new Date("2026-11-17T15:00:00.000Z")).reasonCode, "FUERA_VENTANA");
  getDb()
    .prepare(`INSERT INTO documents (id, user_id, type, expiry, verification_status, created_at) VALUES (?, ?, 'licencia', '2026-12-10', 'verificado', ?)`)
    .run(randomUUID(), carrier.id, stamp);
  assert.equal(carrierCapacity(carrier.id, "2026-12-15").reasonCode, "SIN_DOCUMENTOS");
  getDb().prepare(`UPDATE documents SET expiry = '2027-01-01' WHERE user_id = ?`).run(carrier.id);
  const open = carrierCapacity(carrier.id, "2026-12-15");
  assert.equal(open.status, "disponible");
  assert.equal(open.reasonCode, null);
  assert.equal(open.truckId, truckId);
  busy(carrier.id, owner.id);
  const occupied = carrierCapacity(carrier.id, "2026-12-15");
  assert.equal(occupied.status, "ocupado");
  assert.equal(occupied.reasonCode, "OCUPADO");
});

test("pesos versionados, desempate por id, tarifa por candidato y traza inmutable", async () => {
  withOps(true);
  const data = scene("traza");
  const created = rule(data.admin, data.shipperOrgId, "por_tarifa", {
    pesos: { costo: 1, desempeno: 0, capacidad: 0, disponibilidad: 0 },
  });
  assert.equal(created.pesosVersion, "pesos-v1");
  const stored = getDb().prepare(`SELECT weights_json FROM ops_allocation_rules WHERE id = ?`).get(created.id) as { weights_json: string };
  assert.match(stored.weights_json, /"version":"pesos-v1"/);
  assert.match(stored.weights_json, /"costo":1/);

  const extra = person("transportista", "traza-sintarifa");
  accredit(extra.id);
  const extraOrg = org("transportista", extra.id);
  member(extraOrg, extra.id);
  truck(extra.id, data.origin, data.destination);

  const db = getDb();
  db.prepare(`DELETE FROM trucks WHERE owner_id = ?`).run(data.low.id);
  const older = "00000000-0000-4000-8000-0000000000aa";
  const newer = "ffffffff-ffff-4fff-bfff-ffffffffffff";
  db.prepare(
    `INSERT INTO trucks (id, owner_id, origin, destination, available_from, available_to, equipment, tonnage, specs_json, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, '2020-01-01', '2099-12-31', 'sider', 40, '{}', 0, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')`,
  ).run(older, data.low.id, data.origin, data.destination);
  db.prepare(
    `INSERT INTO trucks (id, owner_id, origin, destination, available_from, available_to, equipment, tonnage, specs_json, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, '2020-01-01', '2099-12-31', 'sider', 40, '{}', 0, '2026-11-17T00:00:00.000Z', '2026-11-17T00:00:00.000Z')`,
  ).run(newer, data.low.id, data.origin, data.destination);

  const run = proposeAllocation(data.admin, { shipmentId: data.shipmentId, ruleId: created.id });
  assert.equal(run.trace?.version, TRACE_VERSION);
  const row = db.prepare(`SELECT trace_version, trace_json, trace_hash FROM ops_allocation_traces WHERE run_id = ?`).get(run.id) as {
    trace_version: string;
    trace_json: string;
    trace_hash: string;
  };
  assert.equal(row.trace_version, "trace-v1");
  assert.equal(row.trace_hash, createHash("sha256").update(row.trace_json, "utf8").digest("hex"));
  assert.throws(() => db.prepare(`UPDATE ops_allocation_traces SET trace_hash = trace_hash WHERE run_id = ?`).run(run.id));
  assert.throws(() => db.prepare(`DELETE FROM ops_allocation_traces WHERE run_id = ?`).run(run.id));
  const body = JSON.parse(row.trace_json) as {
    version: string;
    matchVersion: string;
    pesosVersion: string;
    pesos: { costo: number };
    candidates: { carrierUserId: string; truckId: string | null; status: string; reasonCode: string | null; rateCode: string; tieBreak: string | null }[];
  };
  assert.equal(body.version, "trace-v1");
  assert.equal(body.matchVersion, "match-v1");
  assert.equal(body.pesosVersion, "pesos-v1");
  assert.equal(body.pesos.costo, 1);
  const winner = body.candidates.find((candidate) => candidate.carrierUserId === data.low.id);
  assert.equal(winner?.truckId, older);
  assert.equal(winner?.tieBreak, "id_camion");
  assert.equal(winner?.rateCode, "TARIFA_VIGENTE");
  const missing = body.candidates.find((candidate) => candidate.carrierUserId === extra.id);
  assert.equal(missing?.status, "descartado");
  assert.equal(missing?.reasonCode, "SIN_TARIFA_VIGENTE");
  assert.equal(missing?.rateCode, "SIN_TARIFA_VIGENTE");
  for (const candidate of body.candidates) {
    if (candidate.status === "descartado") assert.equal(typeof candidate.reasonCode, "string");
  }
  const before = row.trace_hash;
  const chosen = run.candidates.find((candidate) => candidate.carrierUserId === data.low.id);
  assert.ok(chosen);
  await confirmAllocation(data.admin, run.id, chosen.id);
  const after = db.prepare(`SELECT trace_hash, trace_json FROM ops_allocation_traces WHERE run_id = ?`).get(run.id) as { trace_hash: string; trace_json: string };
  assert.equal(after.trace_hash, before);
  assert.equal(after.trace_json, row.trace_json);
});

test("peligrosa, refrigerada y minera bloquean la confirmación", async () => {
  withOps(true);
  const cases: { tag: string; equipment: string; loadSpecs: Record<string, unknown>; truckSpecs: Record<string, unknown>; text: RegExp }[] = [
    { tag: "peligro", equipment: "peligrosa", loadSpecs: { clase: 3 }, truckSpecs: { clases: "3" }, text: /autorización/ },
    { tag: "frio", equipment: "refrigerado", loadSpecs: { tempReq: 0 }, truckSpecs: { tempMin: -20, tempMax: 15 }, text: /sanitaria/ },
    { tag: "mina", equipment: "tolva", loadSpecs: { material: "Concentrados", volumenM3: 10 }, truckSpecs: { volumenM3: 30 }, text: /minera/ },
  ];
  for (const item of cases) {
    const data = scene(item.tag);
    const db = getDb();
    db.prepare(`UPDATE loads SET equipment = ?, specs_json = ? WHERE id = ?`).run(item.equipment, JSON.stringify(item.loadSpecs), data.loadId);
    db.prepare(`UPDATE trucks SET equipment = ?, specs_json = ? WHERE owner_id IN (?, ?)`).run(
      item.equipment,
      JSON.stringify(item.truckSpecs),
      data.low.id,
      data.high.id,
    );
    db.prepare(
      `UPDATE ops_rate_card_lines SET equipment = ? WHERE rate_card_id IN (SELECT id FROM ops_rate_cards WHERE shipper_org_id = ?)`,
    ).run(item.equipment, data.shipperOrgId);
    const run = proposeAllocation(data.admin, { shipmentId: data.shipmentId, ruleId: rule(data.admin, data.shipperOrgId, "por_tarifa").id });
    const chosen = run.candidates.find((candidate) => candidate.carrierUserId === data.low.id);
    assert.equal(chosen?.status, "propuesto");
    const traced = run.trace?.body.candidates.find((candidate) => candidate.carrierUserId === data.low.id);
    assert.equal(traced?.blockingChecks.length, 1);
    await assert.rejects(() => confirmAllocation(data.admin, run.id, chosen?.id), item.text);
    assert.equal((db.prepare(`SELECT status FROM loads WHERE id = ?`).get(data.loadId) as { status: string }).status, "abierta");
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM offers WHERE load_id = ?`).get(data.loadId) as { n: number }).n, 0);
  }

  const ready = scene("peligro-ok");
  const db = getDb();
  db.prepare(`UPDATE loads SET equipment = 'peligrosa', specs_json = ? WHERE id = ?`).run(JSON.stringify({ clase: 3 }), ready.loadId);
  db.prepare(`UPDATE trucks SET equipment = 'peligrosa', specs_json = ? WHERE owner_id IN (?, ?)`).run(
    JSON.stringify({ clases: "3", autorizacion: true }),
    ready.low.id,
    ready.high.id,
  );
  db.prepare(
    `UPDATE ops_rate_card_lines SET equipment = 'peligrosa' WHERE rate_card_id IN (SELECT id FROM ops_rate_cards WHERE shipper_org_id = ?)`,
  ).run(ready.shipperOrgId);
  const run = proposeAllocation(ready.admin, { shipmentId: ready.shipmentId, ruleId: rule(ready.admin, ready.shipperOrgId, "por_tarifa").id });
  const chosen = run.candidates.find((candidate) => candidate.carrierUserId === ready.low.id);
  assert.deepEqual(run.trace?.body.candidates.find((candidate) => candidate.carrierUserId === ready.low.id)?.blockingChecks, []);
  const confirmed = await confirmAllocation(ready.admin, run.id, chosen?.id);
  assert.equal(confirmed.status, "confirmada");
});
