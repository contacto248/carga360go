import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { GET as getScores } from "../src/app/api/ops/desempeno/route";
import { POST as postRecalc } from "../src/app/api/ops/desempeno/recalcular/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { MIGRATION_25_SQL, getDb } from "../src/lib/db";
import { rutDv } from "../src/lib/format";
import { carrierCapacity } from "../src/lib/ops/capacity";
import { OPS_FLAGS } from "../src/lib/ops/flags";
import { DEFAULT_RULES, RULE_IDS, recalculateScores } from "../src/lib/ops/scoring";
import { ensurePaymentsSchema } from "../src/lib/pagos/schema";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

const ctx = { params: Promise.resolve({}) };
const PERIOD = { periodStart: "2026-11-01", periodEnd: "2026-11-30" };
const NOW = "2026-11-12T15:00:00.000Z";

let seq = 91_000_000;

function rut() {
  seq += 1;
  const body = String(seq);
  return `${body}-${rutDv(body)}`;
}

function withOps(on: boolean) {
  for (const flag of OPS_FLAGS) delete process.env[flag];
  if (on) process.env.OPS_FEATURE_ENABLED = "true";
}

function person(role: "mandante" | "transportista", tag: string) {
  return registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: tag,
    email: `${tag}-${seq}@ops-score.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 6111 2345",
    city: "Santiago",
  }).user;
}

function admin(tag: string) {
  return upsertAdmin({
    email: `${tag}-${seq}@ops-score.test`,
    password: "Camino-Largo-2026",
    razonSocial: `Admin ${tag}`,
    rut: rut(),
    contactName: tag,
    whatsapp: "+56 9 4444 5555",
    city: "Santiago",
  });
}

function call(method: string, url: string, token?: string, body?: unknown) {
  const headers = new Headers({ host: "127.0.0.1:4317" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token && method !== "GET") headers.set("sec-fetch-site", "same-origin");
  if (token) headers.set("cookie", `${COOKIE_NAME}=${token}`);
  return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function trip(ownerId: string, carrierId: string, opts: {
  pickup: string;
  status: "aceptada" | "retirada";
  awarded?: boolean;
  tripStatus?: string | null;
  specs?: Record<string, unknown>;
  deliveredAt?: string | null;
  plannedDelivery?: string | null;
  rating?: number | null;
  updatedAt?: string;
}) {
  const db = getDb();
  const loadId = randomUUID();
  const offerId = randomUUID();
  const stamp = opts.updatedAt ?? NOW;
  db.prepare(
    `INSERT INTO loads (
       id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, specs_json,
       is_demo, created_at, updated_at, status, awarded_offer_id, trip_status
     ) VALUES (?, ?, 'Calama', 'Antofagasta', ?, 'sider', 'Viaje de prueba', 20, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(
    loadId,
    ownerId,
    opts.pickup,
    JSON.stringify(opts.specs ?? {}),
    stamp,
    stamp,
    opts.awarded ? "adjudicada" : "abierta",
    opts.awarded ? offerId : null,
    opts.tripStatus ?? null,
  );
  db.prepare(
    `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, revisions, created_at, updated_at)
     VALUES (?, ?, ?, 100000, ?, ?, 0, ?, ?)`,
  ).run(offerId, loadId, carrierId, opts.pickup, opts.status, stamp, stamp);
  if (opts.awarded) {
    db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, 'asignado', NULL, ?)`).run(
      randomUUID(),
      loadId,
      carrierId,
      stamp,
    );
  }
  if (opts.deliveredAt) {
    db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, 'entregado', NULL, ?)`).run(
      randomUUID(),
      loadId,
      carrierId,
      opts.deliveredAt,
    );
  }
  if (opts.plannedDelivery) {
    db.prepare(
      `INSERT INTO ops_shipments (id, load_id, stage, planned_delivery_at, created_at, updated_at) VALUES (?, ?, 'ejecucion', ?, ?, ?)`,
    ).run(randomUUID(), loadId, opts.plannedDelivery, stamp, stamp);
  }
  if (opts.rating) {
    db.prepare(
      `INSERT INTO ratings (id, load_id, from_user_id, to_user_id, stars, comment, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    ).run(randomUUID(), loadId, ownerId, carrierId, opts.rating, opts.deliveredAt ?? stamp);
  }
  return { loadId, offerId };
}

function addPod(loadId: string, shipperId: string, carrierId: string) {
  ensurePaymentsSchema(getDb());
  const paymentId = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO freight_payments (
         id, load_id, shipper_user_id, trucker_user_id, currency, freight_net_amount, freight_vat_amount,
         freight_gross_amount, anticipo_percent, anticipo_amount, saldo_amount, fee_payer, fee_rate_estimate, vat_rate,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'CLP', 1000, 190, 1190, 0, 0, 1190, 'shipper', 0, 0.19, ?, ?)`,
    )
    .run(paymentId, loadId, shipperId, carrierId, NOW, NOW);
  getDb()
    .prepare(
      `INSERT INTO pod_evidence (
         id, freight_payment_id, uploaded_by_user_id, kind, storage_key, content_type, size_bytes, checksum_sha256, created_at
       ) VALUES (?, ?, ?, 'foto_documento', 'test/pod', 'image/jpeg', 10, 'abc', ?)`,
    )
    .run(randomUUID(), paymentId, carrierId, NOW);
}

function scoreOf(carrierId: string) {
  return recalculateScores({ carrierUserId: carrierId, ...PERIOD, asOf: new Date("2026-11-17T15:00:00.000Z") }).scores[0];
}

function dump(carrierId: string) {
  const db = getDb();
  return {
    scores: db.prepare(`SELECT * FROM ops_carrier_scores WHERE carrier_user_id = ? ORDER BY id`).all(carrierId),
    events: db.prepare(`SELECT * FROM ops_score_events WHERE carrier_user_id = ? ORDER BY id`).all(carrierId),
  };
}

test("migración 025 coincide con el SQL y no nombra tablas de 022 ni 023", () => {
  const file = fs.readFileSync(path.join(process.cwd(), "docs/migrations/025-ops-desempeno.sql"), "utf8");
  const body = file.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
  assert.equal(body, MIGRATION_25_SQL.replace(/\s+/g, " ").trim());
  assert.doesNotMatch(MIGRATION_25_SQL, /\b(ALTER\s+TABLE|DROP\s+TABLE|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/i);
  const rollback = fs.readFileSync(path.join(process.cwd(), "docs/migrations/025-ops-desempeno-rollback.sql"), "utf8");
  assert.match(rollback, /DROP TABLE IF EXISTS ops_score_events/);
  assert.match(rollback, /DROP TABLE IF EXISTS ops_carrier_scores/);
  assert.match(rollback, /DELETE FROM schema_migrations WHERE version = 25/);
  assert.doesNotMatch(rollback, /ops_organizations|ops_shipments|ops_events/);
  assert.equal(DEFAULT_RULES.version, "ops-score-v1");
});

test("con el flag apagado recalcular y leer responden 404 y no escriben", async () => {
  withOps(false);
  const root = admin("off");
  const token = createSession(root.id, { mfa: true });
  const before = (getDb().prepare(`SELECT COUNT(*) AS n FROM ops_carrier_scores`).get() as { n: number }).n;
  const listed = await getScores(call("GET", "http://127.0.0.1:4317/api/ops/desempeno", token), ctx);
  const created = await postRecalc(call("POST", "http://127.0.0.1:4317/api/ops/desempeno/recalcular", token, {}), ctx);
  assert.equal(listed.status, 404);
  assert.equal(created.status, 404);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_carrier_scores`).get() as { n: number }).n, before);
});

test("entrega a tiempo con POD suma, y sin fecha o sin POD no inventa puntos", () => {
  const owner = person("mandante", "manda-tiempo");
  const onTime = person("transportista", "tiempo");
  const late = person("transportista", "atraso");
  const bare = person("transportista", "sindatos");
  const noPod = person("transportista", "sinpod");

  const done = trip(owner.id, onTime.id, {
    pickup: "2026-11-10",
    status: "aceptada",
    awarded: true,
    tripStatus: "entregado",
    deliveredAt: "2026-11-12T18:00:00.000Z",
    plannedDelivery: "2026-11-12",
    rating: 5,
  });
  addPod(done.loadId, owner.id, onTime.id);
  trip(owner.id, late.id, {
    pickup: "2026-11-10",
    status: "aceptada",
    awarded: true,
    tripStatus: "entregado",
    deliveredAt: "2026-11-14T15:00:00.000Z",
    plannedDelivery: "2026-11-12",
  });
  trip(owner.id, bare.id, {
    pickup: "2026-11-10",
    status: "aceptada",
    awarded: true,
    tripStatus: "entregado",
    deliveredAt: "2026-11-12T18:00:00.000Z",
  });
  trip(owner.id, noPod.id, {
    pickup: "2026-11-10",
    status: "aceptada",
    awarded: true,
    tripStatus: "entregado",
    deliveredAt: "2026-11-12T18:00:00.000Z",
    plannedDelivery: "2026-11-12",
  });

  const good = scoreOf(onTime.id);
  assert.equal(good.onTimePct, 100);
  assert.equal(good.avgRating, 5);
  assert.equal(good.tripsDone, 1);
  assert.equal(good.score, DEFAULT_RULES.base + DEFAULT_RULES.entregaATiempoPod + DEFAULT_RULES.calificacionAlta);
  assert.equal(good.level, "alto");
  assert.ok(good.events.some((event) => event.ruleId === RULE_IDS.entregaATiempoPod && event.points === 10 && event.loadId === done.loadId));
  assert.ok(good.events.some((event) => event.ruleId === RULE_IDS.calificacionAlta && event.points === 8));
  for (const event of good.events) {
    assert.notEqual(event.points, 0);
    assert.equal(typeof event.evidence, "object");
    assert.equal((event.evidence as { rulesVersion: string }).rulesVersion, "ops-score-v1");
  }

  const delayed = scoreOf(late.id);
  assert.equal(delayed.onTimePct, 0);
  assert.equal(delayed.score, DEFAULT_RULES.base + DEFAULT_RULES.atraso);
  assert.equal(delayed.events.length, 1);
  assert.equal(delayed.events[0].ruleId, RULE_IDS.atraso);
  assert.equal(delayed.events[0].points, -8);

  const missing = scoreOf(bare.id);
  assert.equal(missing.onTimePct, null);
  assert.equal(missing.avgRating, null);
  assert.equal(missing.docsValid, null);
  assert.equal(missing.tripsDone, 1);
  assert.equal(missing.events.length, 0);
  assert.equal(missing.score, DEFAULT_RULES.base);

  const punctual = scoreOf(noPod.id);
  assert.equal(punctual.onTimePct, 100);
  assert.equal(punctual.events.some((event) => event.ruleId === RULE_IDS.entregaATiempoPod), false);
  assert.equal(punctual.score, DEFAULT_RULES.base);
});

test("cancelación tardía resta y un retiro anticipado no", () => {
  const owner = person("mandante", "manda-cancela");
  const late = person("transportista", "cancela");
  const early = person("transportista", "temprano");
  trip(owner.id, late.id, {
    pickup: "2026-11-20",
    status: "retirada",
    updatedAt: "2026-11-20T08:00:00.000Z",
  });
  trip(owner.id, early.id, {
    pickup: "2026-11-20",
    status: "retirada",
    updatedAt: "2026-11-01T12:00:00.000Z",
  });
  const cancelled = scoreOf(late.id);
  assert.equal(cancelled.cancelCount, 1);
  assert.equal(cancelled.tripsDone, 0);
  assert.equal(cancelled.events.length, 1);
  assert.equal(cancelled.events[0].ruleId, RULE_IDS.cancelacionTardia);
  assert.equal(cancelled.events[0].points, -12);
  assert.equal(cancelled.score, DEFAULT_RULES.base - 12);
  const ahead = scoreOf(early.id);
  assert.equal(ahead.cancelCount, 0);
  assert.equal(ahead.events.length, 0);
  assert.equal(ahead.score, DEFAULT_RULES.base);
});

test("recalcular dos veces no cambia filas ni duplica eventos", () => {
  const owner = person("mandante", "manda-idem");
  const carrier = person("transportista", "idem");
  trip(owner.id, carrier.id, {
    pickup: "2026-11-10",
    status: "aceptada",
    awarded: true,
    tripStatus: "entregado",
    deliveredAt: "2026-11-14T15:00:00.000Z",
    plannedDelivery: "2026-11-12",
  });
  const first = recalculateScores({ carrierUserId: carrier.id, ...PERIOD, asOf: new Date("2026-11-17T15:00:00.000Z") });
  const snap = dump(carrier.id);
  assert.equal(first.changed, 1);
  assert.equal((snap.events as { rule_id: string }[]).length, 1);
  const second = recalculateScores({ carrierUserId: carrier.id, ...PERIOD, asOf: new Date("2026-11-17T15:00:00.000Z") });
  assert.equal(second.changed, 0);
  assert.deepEqual(dump(carrier.id), snap);
  assert.equal(second.scores[0].computedAt, first.scores[0].computedAt);
});

test("documento vencido resta, retorno explícito suma y no presentarse resta", () => {
  const owner = person("mandante", "manda-extra");
  const expired = person("transportista", "doc");
  const backhaul = person("transportista", "retorno");
  const absent = person("transportista", "ausente");
  getDb()
    .prepare(`INSERT INTO documents (id, user_id, type, expiry, verification_status, created_at) VALUES (?, ?, 'licencia', '2026-11-01', 'verificado', ?)`)
    .run(randomUUID(), expired.id, NOW);
  const returned = trip(owner.id, backhaul.id, {
    pickup: "2026-11-10",
    status: "aceptada",
    awarded: true,
    tripStatus: "entregado",
    specs: { retornoConCarga: true },
    deliveredAt: "2026-11-12T18:00:00.000Z",
  });
  trip(owner.id, absent.id, {
    pickup: "2026-11-10",
    status: "aceptada",
    awarded: true,
    tripStatus: "asignado",
  });

  const docs = scoreOf(expired.id);
  assert.equal(docs.docsValid, 0);
  assert.equal(docs.events.length, 1);
  assert.equal(docs.events[0].ruleId, RULE_IDS.documentoVencido);
  assert.equal(docs.events[0].points, -6);
  assert.equal(docs.events[0].loadId, null);

  const haul = scoreOf(backhaul.id);
  assert.equal(haul.onTimePct, null);
  assert.equal(haul.events.length, 1);
  assert.equal(haul.events[0].ruleId, RULE_IDS.retornoConCarga);
  assert.equal(haul.events[0].loadId, returned.loadId);
  assert.equal(haul.score, DEFAULT_RULES.base + 5);

  const missed = scoreOf(absent.id);
  assert.equal(missed.events.length, 1);
  assert.equal(missed.events[0].ruleId, RULE_IDS.noPresentarse);
  assert.equal(missed.events[0].points, -15);
});

test("solo el admin recalcula y el mandante con desempeno.ver lee", async () => {
  withOps(true);
  const root = admin("lee");
  const owner = person("mandante", "mira");
  const other = person("mandante", "finanzas");
  const carrier = person("transportista", "visto");
  const outsider = person("transportista", "ajeno");
  trip(owner.id, carrier.id, {
    pickup: "2026-11-10",
    status: "aceptada",
    awarded: true,
    tripStatus: "entregado",
    deliveredAt: "2026-11-14T15:00:00.000Z",
    plannedDelivery: "2026-11-12",
  });
  const orgId = randomUUID();
  const stamp = NOW;
  getDb()
    .prepare(`INSERT INTO ops_organizations (id, kind, razon_social, rut_norm, created_by, created_at, updated_at) VALUES (?, 'mandante', 'Mandante piloto', ?, ?, ?, ?)`)
    .run(orgId, `r${seq}`, root.id, stamp, stamp);
  getDb()
    .prepare(`INSERT INTO ops_org_members (id, org_id, user_id, area, ops_role, status, created_at) VALUES (?, ?, ?, NULL, 'trafico', 'activo', ?)`)
    .run(randomUUID(), orgId, owner.id, stamp);
  getDb()
    .prepare(`INSERT INTO ops_org_members (id, org_id, user_id, area, ops_role, status, created_at) VALUES (?, ?, ?, NULL, 'finanzas', 'activo', ?)`)
    .run(randomUUID(), orgId, other.id, stamp);

  const adminToken = createSession(root.id, { mfa: true });
  const denied = await postRecalc(
    call("POST", "http://127.0.0.1:4317/api/ops/desempeno/recalcular", createSession(owner.id), { carrierUserId: carrier.id, ...PERIOD }),
    ctx,
  );
  assert.equal(denied.status, 403);
  const saved = await postRecalc(
    call("POST", "http://127.0.0.1:4317/api/ops/desempeno/recalcular", adminToken, { carrierUserId: carrier.id, ...PERIOD }),
    ctx,
  );
  assert.equal(saved.status, 200);
  const body = (await saved.json()) as { scores: { score: number; events: { evidence: { source: string } }[] }[]; changed: number };
  assert.equal(body.changed, 1);
  assert.equal(body.scores[0].score, DEFAULT_RULES.base - 8);
  assert.equal(body.scores[0].events[0].evidence.source, "trip_events");

  const again = await postRecalc(
    call("POST", "http://127.0.0.1:4317/api/ops/desempeno/recalcular", adminToken, { carrierUserId: carrier.id, ...PERIOD }),
    ctx,
  );
  assert.equal(again.status, 200);
  assert.equal(((await again.json()) as { changed: number }).changed, 0);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_score_events WHERE carrier_user_id = ?`).get(carrier.id) as { n: number }).n, 1);

  const seen = await getScores(call("GET", `http://127.0.0.1:4317/api/ops/desempeno?orgId=${orgId}&carrierUserId=${carrier.id}`, createSession(owner.id)), ctx);
  assert.equal(seen.status, 200);
  const hidden = await getScores(call("GET", `http://127.0.0.1:4317/api/ops/desempeno?orgId=${orgId}`, createSession(other.id)), ctx);
  assert.equal(hidden.status, 403);
  const stranger = await getScores(call("GET", `http://127.0.0.1:4317/api/ops/desempeno?orgId=${orgId}`, createSession(outsider.id)), ctx);
  assert.equal(stranger.status, 403);
  const anon = await getScores(call("GET", "http://127.0.0.1:4317/api/ops/desempeno"), ctx);
  assert.equal(anon.status, 401);
  const asAdmin = await getScores(call("GET", `http://127.0.0.1:4317/api/ops/desempeno?carrierUserId=${carrier.id}`, adminToken), ctx);
  assert.equal(asAdmin.status, 200);
});

test("capacidad: disponible, ocupado o sin datos, sin tabla nueva", () => {
  const carrier = person("transportista", "cupo");
  const owner = person("mandante", "cupo-manda");
  const at = new Date("2026-11-17T15:00:00.000Z");
  assert.equal(carrierCapacity(carrier.id, at).status, "sin_datos");
  const truckId = randomUUID();
  const stamp = NOW;
  getDb()
    .prepare(
      `INSERT INTO trucks (id, owner_id, origin, destination, available_from, available_to, equipment, tonnage, specs_json, is_demo, created_at, updated_at)
       VALUES (?, ?, 'Calama', 'Antofagasta', '2026-11-01', '2026-12-01', 'sider', 28, '{}', 1, ?, ?)`,
    )
    .run(truckId, carrier.id, stamp, stamp);
  assert.equal(carrierCapacity(carrier.id, at).reason, "Sin documentos vigentes para confirmar disponibilidad.");
  getDb()
    .prepare(`INSERT INTO documents (id, user_id, type, expiry, verification_status, created_at) VALUES (?, ?, 'licencia', '2027-01-01', 'verificado', ?)`)
    .run(randomUUID(), carrier.id, stamp);
  const open = carrierCapacity(carrier.id, at);
  assert.equal(open.status, "disponible");
  assert.equal(open.truckId, truckId);
  assert.equal(open.tonnage, 28);
  const { loadId } = trip(owner.id, carrier.id, {
    pickup: "2026-11-16",
    status: "aceptada",
    awarded: true,
    tripStatus: "en_transito",
  });
  const busy = carrierCapacity(carrier.id, at);
  assert.equal(busy.status, "ocupado");
  assert.equal(busy.loadId, loadId);
  const names = (getDb().prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ops_%capacidad%'`).all() as { name: string }[]).map((row) => row.name);
  assert.deepEqual(names, []);
});
