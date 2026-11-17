import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Database from "better-sqlite3";
import { POST as postConductor } from "../src/app/api/ops/gps/conductor/route";
import { POST as postSimulado } from "../src/app/api/ops/gps/simulado/route";
import { GET as getOpsGps } from "../src/app/api/ops/gps/viajes/[id]/route";
import { POST as postGps } from "../src/app/api/viajes/[id]/gps/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { decideAuthorization, ensureBassamOps } from "../src/lib/bassam/ops";
import { REQUIRED_CARRIER_DOCS } from "../src/lib/carrier";
import { getDb } from "../src/lib/db";
import { todayChile } from "../src/lib/format";
import { createLoad } from "../src/lib/listings";
import { acceptOffer, submitOffer } from "../src/lib/offers";
import { simulatedGps } from "../src/lib/ops/gps/connector";
import { driverLocationHref, opsGpsEnabled } from "../src/lib/ops/gps/flag";
import { MIGRATION_27_SQL } from "../src/lib/ops/gps/schema";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";
import { resetRateLimits } from "../src/lib/rate-limit";
import type { PublicUser } from "../src/lib/types";

const ANTOFAGASTA = { lat: -23.6509, lng: -70.3975 };
let n = 1200;

function rut(): string {
  n += 1;
  const body = String(50_000_000 + n * 97);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  return `${body}-${rest === 11 ? "0" : rest === 10 ? "K" : String(rest)}`;
}

function person(role: "mandante" | "transportista", tag: string): PublicUser {
  const { user: created } = registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: `Contacto ${tag}`,
    email: `${tag}@ops-gps.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(40000000 + n).padStart(8, "0")}`,
    city: "La Serena",
  });
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `UPDATE users SET email_verified_at = ?, verification_status = 'verificado', phone_verified_at = ?, privacy_version = ?, privacy_accepted_at = ?, terms_version = ?, terms_accepted_at = ?, req_calidad = 'cumple', req_seguridad = 'cumple', req_medioambiente = 'no_aplica' WHERE id = ?`,
  ).run(stamp, stamp, PRIVACY_VERSION, stamp, TERMS_VERSION, stamp, created.id);
  if (role === "transportista") {
    for (const type of REQUIRED_CARRIER_DOCS) {
      db.prepare(
        `INSERT INTO documents (id, user_id, audience, type, holder_name, expiry, verification_status, created_at) VALUES (?, ?, ?, ?, ?, '2099-01-01', 'verificado', ?)`,
      ).run(randomUUID(), created.id, ["cedula", "licencia"].includes(type) ? "personal" : "camion", type, "Prueba", stamp);
    }
  }
  return { ...created, emailVerifiedAt: stamp, verificationStatus: "verificado" };
}

function addDays(days: number): string {
  const [y, m, d] = todayChile().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function req(path: string, method: string, token: string | null, body?: unknown, bearer = false) {
  const headers = new Headers({ host: "127.0.0.1:4317", accept: "application/json" });
  if (!bearer) headers.set("sec-fetch-site", "same-origin");
  if (token && bearer) headers.set("authorization", `Bearer ${token}`);
  if (token && !bearer) headers.set("cookie", `${COOKIE_NAME}=${token}`);
  if (body) headers.set("content-type", "application/json");
  return new Request(`http://127.0.0.1:4317${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function awardedTrip() {
  const owner = person("mandante", `dueno-${n}`);
  const carrier = person("transportista", `chofer-${n}`);
  const load = createLoad(owner, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(6),
    equipment: "rampla_plana",
    description: "Prueba GPS",
    weightT: 10,
    specs: {},
  });
  const offer = await submitOffer(carrier, load.id, { priceClp: 800000, pickupDate: addDays(6) }, { notify: false });
  await acceptOffer(owner, offer.offer.id, { notify: false });
  return { owner, carrier, load };
}

const admin = upsertAdmin({
  email: "ops-gps-admin@ops-gps.test",
  password: "Camino-Largo-2026",
  razonSocial: "Admin GPS",
  rut: rut(),
  contactName: "Admin",
  whatsapp: "+56 9 32223344",
  city: "La Serena",
});

test("migración 27 solo crea tablas nuevas y la reversa no toca trip_gps_points", () => {
  const versions = (getDb().prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as { version: number }[]).map((row) => row.version);
  assert.ok(versions.includes(22));
  assert.ok(versions.includes(23));
  assert.ok(versions.includes(27));
  assert.equal(versions.filter((version) => version === 27).length, 1);
  assert.ok(versions.includes(24));
  for (const reserved of [25, 26]) assert.equal(versions.includes(reserved), false);
  assert.doesNotMatch(MIGRATION_27_SQL, /trip_gps_points|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s|DELETE\s+FROM/i);
  const doc = fs.readFileSync(new URL("../docs/migrations/027-gps-conector.sql", import.meta.url), "utf8");
  for (const line of MIGRATION_27_SQL.split("\n").map((item) => item.trim()).filter(Boolean)) assert.ok(doc.includes(line), line);
  const rollback = fs.readFileSync(new URL("../docs/migrations/027-gps-conector-rollback.sql", import.meta.url), "utf8");
  assert.match(rollback, /DROP TABLE IF EXISTS ops_telematics_sources/);
  assert.match(rollback, /DROP TABLE IF EXISTS ops_gps_receipts/);
  assert.match(rollback, /DELETE FROM schema_migrations WHERE version = 27/);
  const rollbackSql = rollback
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(rollbackSql, /trip_gps_points|\bloads\b|\busers\b/);

  const db = new Database(":memory:");
  db.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  db.exec(MIGRATION_27_SQL);
  db.exec(MIGRATION_27_SQL);
  db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (27, ?)`).run("2026-11-17T00:00:00.000Z");
  db.prepare(`INSERT INTO ops_telematics_sources (id, provider, label, credential_ref, created_at) VALUES ('src', 'simulado', 'Recorrido simulado', NULL, ?)`).run("2026-11-17T00:00:00.000Z");
  db.prepare(`INSERT INTO ops_gps_receipts (id, source_id, load_id, gps_point_id, created_at) VALUES ('r', 'src', 'carga', 'punto', ?)`).run("2026-11-17T00:00:00.000Z");
  db.exec(`CREATE TABLE trip_gps_points (id TEXT PRIMARY KEY, load_id TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, recorded_at TEXT NOT NULL)`);
  db.prepare(`INSERT INTO trip_gps_points (id, load_id, lat, lng, recorded_at) VALUES ('punto', 'carga', -33.45, -70.67, ?)`).run("2026-11-17T00:00:00.000Z");
  db.exec(rollback);
  assert.equal(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ops_%'`).all().length, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 27`).get() as { n: number }).n, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM trip_gps_points`).get() as { n: number }).n, 1);
  db.close();
});

test("el conector simulado no usa red ni credenciales", () => {
  const source = fs.readFileSync(new URL("../src/lib/ops/gps/connector.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|\baxios\b|wialon|https?:\/\//i);
  const fixes = simulatedGps.collect({
    origin: { lat: -29.9, lng: -71.25 },
    destination: { lat: -33.45, lng: -70.67 },
    steps: 4,
    endedAt: new Date("2026-11-17T12:00:00.000Z"),
  });
  assert.equal(fixes.length, 4);
  assert.equal(fixes[0]?.lat, -29.9);
  assert.equal(fixes[3]?.lat, -33.45);
  assert.ok(fixes.every((fix, index) => index === 0 || fix.recordedAt > fixes[index - 1]!.recordedAt));
  assert.equal(driverLocationHref("carga-1", false), null);
  assert.equal(driverLocationHref("carga-1", true), "/viajes/carga-1/ubicacion");
  delete process.env.OPS_FEATURE_ENABLED;
  assert.equal(opsGpsEnabled(), false);
  process.env.OPS_FEATURE_ENABLED = "TRUE";
  assert.equal(opsGpsEnabled(), false);
  delete process.env.OPS_FEATURE_ENABLED;
  const page = fs.readFileSync(new URL("../src/app/cargas/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const gpsHref = viaje \? driverLocationHref\(load\.id\) : null/);
  assert.match(page, /\{gpsHref \?/);
  const board = fs.readFileSync(new URL("../src/components/TripBoard.tsx", import.meta.url), "utf8");
  assert.match(board, /Estados declarados por los participantes\. No corresponde a ubicación GPS\./);
});

test("con el flag apagado las rutas nuevas responden 404 y no guardan puntos", async () => {
  delete process.env.OPS_FEATURE_ENABLED;
  resetRateLimits();
  ensureBassamOps();
  const { carrier, load } = await awardedTrip();
  const token = createSession(carrier.id);
  const before = getDb().prepare(`SELECT COUNT(*) AS n FROM trip_gps_points WHERE load_id = ?`).get(load.id) as { n: number };
  const sim = await postSimulado(req("/api/ops/gps/simulado", "POST", token, { loadId: load.id }), { params: Promise.resolve({}) });
  const driver = await postConductor(req("/api/ops/gps/conductor", "POST", null, { loadId: load.id, ...ANTOFAGASTA }), { params: Promise.resolve({}) });
  const listed = await getOpsGps(req(`/api/ops/gps/viajes/${load.id}`, "GET", null), { params: Promise.resolve({ id: load.id }) });
  assert.equal(sim.status, 404);
  assert.equal(driver.status, 404);
  assert.equal(listed.status, 404);
  const after = getDb().prepare(`SELECT COUNT(*) AS n FROM trip_gps_points WHERE load_id = ?`).get(load.id) as { n: number };
  assert.equal(after.n, before.n);
});

test("con el flag encendido entran el recorrido simulado y el punto del conductor", async () => {
  process.env.OPS_FEATURE_ENABLED = "true";
  resetRateLimits();
  try {
    const { owner, carrier, load } = await awardedTrip();
    const stranger = person("transportista", `ajeno-${n}`);
    const adminToken = createSession(admin.id, { mfa: true });
    const carrierToken = createSession(carrier.id);
    const blocked = await postConductor(req("/api/ops/gps/conductor", "POST", carrierToken, { loadId: load.id, ...ANTOFAGASTA }), {
      params: Promise.resolve({}),
    });
    assert.equal(blocked.status, 403);

    decideAuthorization(admin, load.id, "autorizar");
    const deniedSim = await postSimulado(req("/api/ops/gps/simulado", "POST", carrierToken, { loadId: load.id }), { params: Promise.resolve({}) });
    assert.equal(deniedSim.status, 403);

    const saved = await postSimulado(req("/api/ops/gps/simulado", "POST", adminToken, { loadId: load.id, steps: 4 }), { params: Promise.resolve({}) });
    assert.equal(saved.status, 201);
    const simulated = await saved.json();
    assert.equal(simulated.provider, "simulado");
    assert.equal(simulated.points.length, 4);
    assert.equal(simulated.points[0].lat, -29.9);
    assert.equal(simulated.points[3].lat, -33.45);
    assert.equal(simulated.points.every((point: { provider: string }) => point.provider === "simulado"), true);

    const driver = await postConductor(
      req("/api/ops/gps/conductor", "POST", carrierToken, { loadId: load.id, ...ANTOFAGASTA, recordedAt: "1999-01-01T00:00:00.000Z", email: owner.email }, false),
      { params: Promise.resolve({}) },
    );
    assert.equal(driver.status, 201);
    const point = await driver.json();
    assert.equal(point.provider, "conductor");
    assert.equal(point.point.lat, ANTOFAGASTA.lat);
    assert.equal(point.point.lng, ANTOFAGASTA.lng);
    assert.notEqual(point.point.recordedAt, "1999-01-01T00:00:00.000Z");
    assert.equal(JSON.stringify(point).includes(owner.email), false);

    const fromApp = await postConductor(
      req("/api/ops/gps/conductor", "POST", carrierToken, { loadId: load.id, lat: -33.45, lng: -70.67 }, true),
      { params: Promise.resolve({}) },
    );
    assert.equal(fromApp.status, 201);

    const listed = await getOpsGps(req(`/api/ops/gps/viajes/${load.id}`, "GET", createSession(owner.id)), { params: Promise.resolve({ id: load.id }) });
    assert.equal(listed.status, 200);
    const body = await listed.json();
    assert.equal(body.points.length, 6);
    assert.equal(body.points.filter((item: { provider: string }) => item.provider === "conductor").length, 2);
    assert.equal(JSON.stringify(body).includes(owner.email), false);

    const columns = getDb().prepare(`PRAGMA table_info(trip_gps_points)`).all() as { name: string }[];
    assert.deepEqual(columns.map((column) => column.name).sort(), ["id", "lat", "lng", "load_id", "recorded_at"]);
    const secrets = getDb().prepare(`SELECT credential_ref FROM ops_telematics_sources`).all() as { credential_ref: string | null }[];
    assert.ok(secrets.length >= 2);
    assert.ok(secrets.every((row) => row.credential_ref == null));

    const other = await getOpsGps(req(`/api/ops/gps/viajes/${load.id}`, "GET", createSession(stranger.id)), { params: Promise.resolve({ id: load.id }) });
    assert.equal(other.status, 403);
    const anon = await getOpsGps(req(`/api/ops/gps/viajes/${load.id}`, "GET", null), { params: Promise.resolve({ id: load.id }) });
    assert.equal(anon.status, 401);
    const outside = await postConductor(req("/api/ops/gps/conductor", "POST", carrierToken, { loadId: load.id, lat: 0, lng: 0 }), { params: Promise.resolve({}) });
    assert.equal(outside.status, 400);

    const legacy = await postGps(req(`/api/viajes/${load.id}/gps`, "POST", carrierToken, ANTOFAGASTA), { params: Promise.resolve({ id: load.id }) });
    assert.equal(legacy.status, 201);
    const legacyBody = await legacy.json();
    assert.equal(legacyBody.clasificacion, "Probada en test");
    assert.equal("id" in legacyBody, false);
  } finally {
    delete process.env.OPS_FEATURE_ENABLED;
  }
});
