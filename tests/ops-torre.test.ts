import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { PUT as putAlertas, GET as getAlertas } from "../src/app/api/ops/envios/[id]/alertas/route";
import { GET as getEta } from "../src/app/api/ops/envios/[id]/eta/route";
import { GET as getEvaluar } from "../src/app/api/ops/envios/[id]/geocercas/evaluar/route";
import { POST as postGeocercas } from "../src/app/api/ops/envios/[id]/geocercas/route";
import { POST as postSeguimiento } from "../src/app/api/ops/envios/[id]/seguimiento/route";
import { POST as postSenal } from "../src/app/api/ops/alertas/senal/route";
import { GET as getPublico } from "../src/app/api/ops/seguimiento/[token]/route";
import { POST as postConductor } from "../src/app/api/ops/gps/conductor/route";
import { middleware } from "../src/middleware";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { decideAuthorization } from "../src/lib/bassam/ops";
import { setCostosFetch } from "../src/lib/costos/http";
import { getParams } from "../src/lib/costos/params";
import { getDb } from "../src/lib/db";
import { todayChile, rutDv } from "../src/lib/format";
import { createLoad } from "../src/lib/listings";
import { evaluateSilentSignals, listAlerts } from "../src/lib/ops/alerts";
import { ensureShipmentForLoad, verifyChain } from "../src/lib/ops/shipments";
import type { PublicUser } from "../src/lib/types";

const ORIGEN = { lat: -29.9028, lng: -71.2519 };
const DESTINO = { lat: -33.45, lng: -70.6667 };
let seq = 0;

function nextRut(): string {
  seq += 1;
  const body = String(20_400_000 + seq * 151).padStart(8, "0");
  return `${body}-${rutDv(body)}`;
}

function addDays(days: number): string {
  const [year, month, day] = todayChile().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function person(role: "mandante" | "transportista", tag: string): PublicUser {
  const { user } = registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: nextRut(),
    contactName: `Contacto ${tag}`,
    email: `${tag}-${seq}@ops-torre.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(46000000 + seq).padStart(8, "0")}`,
    city: "La Serena",
  });
  return user;
}

type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

function call(handler: Handler, path: string, method: string, params: Record<string, string>, cookie?: string, body?: unknown) {
  const headers = new Headers({ host: "127.0.0.1:4317", "sec-fetch-site": "same-origin", accept: "application/json" });
  if (cookie) headers.set("cookie", `${COOKIE_NAME}=${cookie}`);
  if (body) headers.set("content-type", "application/json");
  return handler(new Request(`http://127.0.0.1:4317${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), {
    params: Promise.resolve(params),
  });
}

test("el middleware responde 404 HTTP y no la pantalla de carga", async () => {
  const previous = process.env.OPS_FEATURE_ENABLED;
  try {
    delete process.env.OPS_FEATURE_ENABLED;
    const hidden = middleware(new NextRequest("http://127.0.0.1:4317/seguimiento/abc123token"));
    assert.equal(hidden.status, 404);
    const html = await hidden.text();
    assert.match(html, /No encontramos esa página/);
    assert.equal(html.includes("Cargando"), false);
    const adminHidden = middleware(new NextRequest("http://127.0.0.1:4317/admin/ops/torre"));
    assert.equal(adminHidden.status, 404);
    assert.equal((await adminHidden.text()).includes("Cargando"), false);

    process.env.OPS_FEATURE_ENABLED = "true";
    const open = middleware(new NextRequest("http://127.0.0.1:4317/seguimiento/abc123token"));
    assert.notEqual(open.status, 404);
  } finally {
    if (previous === undefined) delete process.env.OPS_FEATURE_ENABLED;
    else process.env.OPS_FEATURE_ENABLED = previous;
  }
});

test("el conector recalcula el ETA, abre alertas con evidencia y el enlace no lleva contactos", async () => {
  const previous = process.env.OPS_FEATURE_ENABLED;
  const calls: string[] = [];
  let step = 0;
  setCostosFetch(async (url) => {
    calls.push(url);
    assert.match(url, /\/route\/v1\/driving\//);
    const duration = step === 0 ? 1000 : 2000;
    const distance = duration * 10;
    step += 1;
    return new Response(JSON.stringify({ code: "Ok", routes: [{ distance, duration, geometry: "", legs: [{ steps: [] }] }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const owner = person("mandante", "dueno");
  const carrier = person("transportista", "chofer");
  const load = createLoad(owner, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(5),
    equipment: "rampla_plana",
    description: "Pallets de torre",
    weightT: 12,
    specs: {},
  });
  const offerId = randomUUID();
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, revisions, created_at, updated_at)
     VALUES (?, ?, ?, 900000, ?, 'aceptada', 0, ?, ?)`,
  ).run(offerId, load.id, carrier.id, addDays(5), stamp, stamp);
  db.prepare(`UPDATE loads SET awarded_offer_id = ?, status = 'adjudicada', trip_status = 'en_transito' WHERE id = ?`).run(offerId, load.id);
  const admin = upsertAdmin({
    email: `admin-${seq}@ops-torre.test`,
    password: "Camino-Largo-2026",
    razonSocial: "Admin torre",
    rut: nextRut(),
    contactName: "Admin",
    whatsapp: "+56 9 55557777",
    city: "Santiago",
  });
  decideAuthorization(admin, load.id, "autorizar");
  const earlier = new Date(Date.now() - 40 * 60_000).toISOString();
  db.prepare(`INSERT INTO trip_gps_points (id, load_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?, ?)`).run(
    randomUUID(),
    load.id,
    ORIGEN.lat,
    ORIGEN.lng,
    earlier,
  );
  const shipment = ensureShipmentForLoad(load.id, admin);
  db.prepare(`UPDATE ops_shipments SET planned_delivery_at = ? WHERE id = ?`).run("2020-01-01T00:00:00.000Z", shipment.id);
  const adminCookie = createSession(admin.id, { mfa: true });
  const carrierCookie = createSession(carrier.id);

  try {
    delete process.env.OPS_FEATURE_ENABLED;
    const hidden = await call(postGeocercas, `/api/ops/envios/${shipment.id}/geocercas`, "POST", { id: shipment.id }, adminCookie, {
      point: "destino",
      ...DESTINO,
      radiusM: 500,
    });
    assert.equal(hidden.status, 404);
    assert.equal(calls.length, 0);

    process.env.OPS_FEATURE_ENABLED = "true";
    const origen = await call(postGeocercas, `/api/ops/envios/${shipment.id}/geocercas`, "POST", { id: shipment.id }, adminCookie, {
      point: "origen",
      ...ORIGEN,
      radiusM: 800,
    });
    assert.equal(origen.status, 201);
    const destino = await call(postGeocercas, `/api/ops/envios/${shipment.id}/geocercas`, "POST", { id: shipment.id }, adminCookie, {
      point: "destino",
      ...DESTINO,
      radiusM: 600,
    });
    assert.equal(destino.status, 201);
    const tuned = await call(putAlertas, `/api/ops/envios/${shipment.id}/alertas`, "PUT", { id: shipment.id }, adminCookie, {
      atrasoMin: 15,
      detencionMin: 20,
      sinSenalMin: 45,
    });
    assert.equal(tuned.status, 200);

    const parked = await postConductor(
      callRequest("/api/ops/gps/conductor", carrierCookie, { loadId: load.id, ...ORIGEN }),
      { params: Promise.resolve({}) },
    );
    assert.equal(parked.status, 201);
    assert.equal(calls.length, 1);
    assert.match(calls[0] ?? "", /router\.project-osrm\.org/);

    const factor = getParams().factorDuracionCamion;
    const eta = (await (await call(getEta, `/api/ops/envios/${shipment.id}/eta`, "GET", { id: shipment.id }, adminCookie)).json()) as {
      eta: { provider: string; profile: string; truckAware: boolean; durationS: number; durationTruckS: number; aviso: string; recalculado: boolean };
    };
    assert.equal(eta.eta.provider, "osrm");
    assert.equal(eta.eta.profile, "driving (auto)");
    assert.equal(eta.eta.truckAware, false);
    assert.match(eta.eta.aviso, /perfil de auto/);
    assert.equal(eta.eta.durationS, 1000);
    assert.equal(eta.eta.durationTruckS, 1000 * factor);

    const seen = (await (await call(getEvaluar, `/api/ops/envios/${shipment.id}/geocercas/evaluar`, "GET", { id: shipment.id }, adminCookie)).json()) as {
      evaluacion: { point: string; inside: boolean }[];
    };
    assert.equal(seen.evaluacion.find((hit) => hit.point === "origen")?.inside, true);
    assert.equal(seen.evaluacion.find((hit) => hit.point === "destino")?.inside, false);

    const alerts = (await (await call(getAlertas, `/api/ops/envios/${shipment.id}/alertas`, "GET", { id: shipment.id }, adminCookie)).json()) as {
      alerts: { kind: string; status: string; evidence: { gpsPointId?: string; umbralMin?: number; truckAware?: boolean } }[];
    };
    const late = alerts.alerts.find((item) => item.kind === "atraso" && item.status === "abierta");
    const stopped = alerts.alerts.find((item) => item.kind === "detencion" && item.status === "abierta");
    assert.ok(late);
    assert.equal(late?.evidence.truckAware, false);
    assert.equal(late?.evidence.umbralMin, 15);
    assert.ok(stopped);
    assert.ok(stopped?.evidence.gpsPointId);
    assert.equal(JSON.stringify(alerts).includes(owner.email), false);

    const arrived = await postConductor(
      callRequest("/api/ops/gps/conductor", carrierCookie, { loadId: load.id, ...DESTINO }),
      { params: Promise.resolve({}) },
    );
    assert.equal(arrived.status, 201);
    assert.equal(calls.length, 2);
    const again = (await (await call(getEta, `/api/ops/envios/${shipment.id}/eta`, "GET", { id: shipment.id }, adminCookie)).json()) as {
      eta: { durationS: number };
    };
    assert.equal(again.eta.durationS, 2000);
    const atDest = (await (await call(getEvaluar, `/api/ops/envios/${shipment.id}/geocercas/evaluar`, "GET", { id: shipment.id }, adminCookie)).json()) as {
      evaluacion: { point: string; inside: boolean }[];
    };
    assert.equal(atDest.evaluacion.find((hit) => hit.point === "destino")?.inside, true);

    db.prepare(`UPDATE trip_gps_points SET recorded_at = ? WHERE load_id = ?`).run("2020-06-01T00:00:00.000Z", load.id);
    const quiet = (await (await call(getAlertas, `/api/ops/envios/${shipment.id}/alertas`, "GET", { id: shipment.id }, adminCookie)).json()) as {
      alerts: { kind: string; status: string; evidence: { minutos?: number; recordedAt?: string } }[];
    };
    const silent = quiet.alerts.find((item) => item.kind === "sin_senal" && item.status === "abierta");
    assert.ok(silent);
    assert.ok((silent?.evidence.minutos ?? 0) >= 45);
    assert.equal(silent?.evidence.recordedAt, "2020-06-01T00:00:00.000Z");

    const issued = await call(postSeguimiento, `/api/ops/envios/${shipment.id}/seguimiento`, "POST", { id: shipment.id }, adminCookie);
    assert.equal(issued.status, 201);
    const link = (await issued.json()) as { token: string; path: string };
    assert.match(link.path, /^\/seguimiento\//);
    const pub = await call(getPublico, `/api/ops/seguimiento/${link.token}`, "GET", { token: link.token });
    assert.equal(pub.status, 200);
    const body = await pub.json();
    const text = JSON.stringify(body);
    assert.equal(text.includes(owner.email), false);
    assert.equal(text.includes("55557777"), false);
    assert.equal(text.includes(owner.razonSocial), false);
    assert.equal((body as { origin: string }).origin, "La Serena");
    assert.equal((body as { destination: string }).destination, "Santiago");
    assert.equal((body as { truckAware: boolean }).truckAware, false);
    assert.equal(typeof (body as { stage: string }).stage, "string");
    assert.equal("etaAt" in (body as object), true);
    assert.equal("alerts" in (body as object), false);
    assert.equal(text.includes("sin_senal"), false);
    assert.equal(text.includes("detencion"), false);
    assert.equal(text.includes("atraso"), false);
    assert.equal(text.includes("severity"), false);
    const internas = db
      .prepare(`SELECT kind FROM ops_alerts WHERE shipment_id = ? AND status = 'abierta'`)
      .all(shipment.id) as { kind: string }[];
    assert.ok(internas.some((item) => item.kind === "sin_senal"));
    const repeat = await call(postSeguimiento, `/api/ops/envios/${shipment.id}/seguimiento`, "POST", { id: shipment.id }, adminCookie);
    assert.equal(repeat.status, 200);
    const repeatBody = (await repeat.json()) as { created?: boolean; token?: string };
    assert.equal(repeatBody.created, false);
    assert.equal(repeatBody.token, undefined);
    assert.equal(JSON.stringify(repeatBody).includes(link.token), false);
    const missing = await call(getPublico, "/api/ops/seguimiento/no-existe-token-xxxx", "GET", { token: "no-existe-token-xxxx" });
    assert.equal(missing.status, 404);

    assert.equal(verifyChain(shipment.id).ok, true);
    const cols = (db.prepare(`PRAGMA table_info(trip_gps_points)`).all() as { name: string }[]).map((column) => column.name).sort();
    assert.deepEqual(cols, ["id", "lat", "lng", "load_id", "recorded_at"]);

    delete process.env.OPS_FEATURE_ENABLED;
    const closed = await call(getPublico, `/api/ops/seguimiento/${link.token}`, "GET", { token: link.token });
    assert.equal(closed.status, 404);
  } finally {
    setCostosFetch(null);
    if (previous === undefined) delete process.env.OPS_FEATURE_ENABLED;
    else process.env.OPS_FEATURE_ENABLED = previous;
  }
});

function callRequest(path: string, cookie: string, body: unknown) {
  const headers = new Headers({
    host: "127.0.0.1:4317",
    "sec-fetch-site": "same-origin",
    accept: "application/json",
    "content-type": "application/json",
    cookie: `${COOKIE_NAME}=${cookie}`,
  });
  return new Request(`http://127.0.0.1:4317${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

const JOB_SECRET = "evaluador-senal-secreto-de-prueba";

function awarded(tag: string) {
  const owner = person("mandante", tag);
  const carrier = person("transportista", `${tag}-chofer`);
  const load = createLoad(owner, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(5),
    equipment: "rampla_plana",
    description: "Pallets de seguimiento",
    weightT: 12,
    specs: {},
  });
  const offerId = randomUUID();
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, revisions, created_at, updated_at)
     VALUES (?, ?, ?, 900000, ?, 'aceptada', 0, ?, ?)`,
  ).run(offerId, load.id, carrier.id, addDays(5), stamp, stamp);
  db.prepare(`UPDATE loads SET awarded_offer_id = ?, status = 'adjudicada', trip_status = 'en_transito' WHERE id = ?`).run(offerId, load.id);
  const admin = upsertAdmin({
    email: `admin-${tag}-${seq}@ops-torre.test`,
    password: "Camino-Largo-2026",
    razonSocial: "Admin torre",
    rut: nextRut(),
    contactName: "Admin",
    whatsapp: `+56 9 ${String(47000000 + seq).padStart(8, "0")}`,
    city: "Santiago",
  });
  const shipment = ensureShipmentForLoad(load.id, admin);
  return { owner, load, shipment, admin, adminCookie: createSession(admin.id, { mfa: true }) };
}

function pin(loadId: string, at: string) {
  getDb()
    .prepare(`INSERT INTO trip_gps_points (id, load_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), loadId, ORIGEN.lat, ORIGEN.lng, at);
}

function openCount(shipmentId: string, kind: string) {
  return (
    getDb().prepare(`SELECT COUNT(*) AS n FROM ops_alerts WHERE shipment_id = ? AND kind = ? AND status = 'abierta'`).get(shipmentId, kind) as {
      n: number;
    }
  ).n;
}

test("el enlace público muestra estado y ETA y no las alertas internas", async () => {
  const previous = process.env.OPS_FEATURE_ENABLED;
  const page = fs.readFileSync(path.join(__dirname, "../src/app/seguimiento/[token]/page.tsx"), "utf8");
  assert.equal(/ops_alerts|sin_senal|detencion|atraso|alerta/i.test(page), false);
  const { load, shipment, adminCookie } = awarded("publico");
  const stamp = "2026-06-01T12:00:00.000Z";
  pin(load.id, stamp);
  getDb()
    .prepare(
      `INSERT INTO ops_alerts (id, shipment_id, kind, status, severity, evidence_json, opened_at, updated_at)
       VALUES (?, ?, 'sin_senal', 'abierta', 'alta', ?, ?, ?),
              (?, ?, 'detencion', 'abierta', 'alta', ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      shipment.id,
      JSON.stringify({ nota: "nota-interna-ops-9f3" }),
      stamp,
      stamp,
      randomUUID(),
      shipment.id,
      JSON.stringify({ nota: "nota-interna-ops-9f3" }),
      stamp,
      stamp,
    );
  try {
    process.env.OPS_FEATURE_ENABLED = "true";
    const issued = await call(postSeguimiento, `/api/ops/envios/${shipment.id}/seguimiento`, "POST", { id: shipment.id }, adminCookie);
    assert.equal(issued.status, 201);
    const link = (await issued.json()) as { token: string };
    const before = openCount(shipment.id, "sin_senal") + openCount(shipment.id, "detencion");
    assert.equal(before, 2);
    const pub = await call(getPublico, `/api/ops/seguimiento/${link.token}`, "GET", { token: link.token });
    assert.equal(pub.status, 200);
    const body = (await pub.json()) as {
      stage: string;
      etaAt: string | null;
      origin: string;
      destination: string;
      position: { lat: number } | null;
      truckAware: boolean;
    };
    assert.deepEqual(Object.keys(body).sort(), ["destination", "etaAt", "origin", "position", "stage", "token", "truckAware"]);
    assert.equal(body.origin, "La Serena");
    assert.equal(body.destination, "Santiago");
    assert.equal(typeof body.stage, "string");
    assert.equal(body.stage.length > 0, true);
    assert.equal("etaAt" in body, true);
    assert.equal(body.truckAware, false);
    assert.ok(body.position);
    const text = JSON.stringify(body);
    assert.equal(text.includes("nota-interna-ops-9f3"), false);
    assert.equal(text.includes("sin_senal"), false);
    assert.equal(text.includes("detencion"), false);
    assert.equal(text.includes("atraso"), false);
    assert.equal(text.includes("severity"), false);
    assert.equal(text.includes("alerts"), false);
    assert.equal(openCount(shipment.id, "sin_senal") + openCount(shipment.id, "detencion"), 2);
    delete process.env.OPS_FEATURE_ENABLED;
    const closed = await call(getPublico, `/api/ops/seguimiento/${link.token}`, "GET", { token: link.token });
    assert.equal(closed.status, 404);
  } finally {
    if (previous === undefined) delete process.env.OPS_FEATURE_ENABLED;
    else process.env.OPS_FEATURE_ENABLED = previous;
  }
});

test("sin_senal usa 45 minutos por defecto y solo la abre el evaluador invocado", async () => {
  const previous = {
    flag: process.env.OPS_FEATURE_ENABLED,
    detencion: process.env.OPS_ALERTA_DETENCION_MIN,
    silent: process.env.OPS_ALERTA_SIN_SENAL_MIN,
    secret: process.env.OPS_ALERTAS_JOB_SECRET,
  };
  delete process.env.OPS_ALERTA_DETENCION_MIN;
  delete process.env.OPS_ALERTA_SIN_SENAL_MIN;
  delete process.env.OPS_ALERTAS_JOB_SECRET;
  const { load, shipment, admin } = awarded("umbral");
  const now = new Date("2026-06-01T12:00:00.000Z");
  pin(load.id, new Date(now.getTime() - 55 * 60_000).toISOString());
  pin(load.id, new Date(now.getTime() - 30 * 60_000).toISOString());

  function job(secret?: string) {
    const headers = new Headers({ host: "127.0.0.1:4317", accept: "application/json" });
    if (secret) headers.set("authorization", `Bearer ${secret}`);
    return postSenal(new Request("http://127.0.0.1:4317/api/ops/alertas/senal", { method: "POST", headers }), {
      params: Promise.resolve({}),
    });
  }

  try {
    process.env.OPS_FEATURE_ENABLED = "true";
    const listed = listAlerts(admin, shipment.id, now);
    assert.equal(listed.thresholds.detencion, 20);
    assert.equal(listed.thresholds.sin_senal, 45);
    assert.equal(listed.thresholds.atraso, 30);
    const stopped = listed.alerts.find((item) => item.kind === "detencion" && item.status === "abierta");
    assert.equal(stopped?.severity, "alta");
    assert.equal(openCount(shipment.id, "sin_senal"), 0);
    evaluateSilentSignals(now);
    assert.equal(openCount(shipment.id, "sin_senal"), 0);
    const due = new Date(now.getTime() + 15 * 60_000);
    evaluateSilentSignals(due);
    assert.equal(openCount(shipment.id, "sin_senal"), 1);
    const silent = listAlerts(admin, shipment.id, due);
    assert.equal(silent.alerts.find((item) => item.kind === "sin_senal" && item.status === "abierta")?.severity, "alta");
    evaluateSilentSignals(now);
    assert.equal(openCount(shipment.id, "sin_senal"), 0);
    process.env.OPS_ALERTA_SIN_SENAL_MIN = "20";
    evaluateSilentSignals(now);
    assert.equal(openCount(shipment.id, "sin_senal"), 1);
    delete process.env.OPS_ALERTA_SIN_SENAL_MIN;
    evaluateSilentSignals(now);
    assert.equal(openCount(shipment.id, "sin_senal"), 0);
    process.env.OPS_ALERTA_DETENCION_MIN = "40";
    const tightened = listAlerts(admin, shipment.id, now);
    assert.equal(tightened.thresholds.detencion, 40);
    assert.equal(tightened.alerts.some((item) => item.kind === "detencion" && item.status === "abierta"), false);
    process.env.OPS_ALERTA_DETENCION_MIN = "30min";
    const fallback = listAlerts(admin, shipment.id, now);
    assert.equal(fallback.thresholds.detencion, 20);
    assert.equal(fallback.alerts.some((item) => item.kind === "detencion" && item.status === "abierta"), true);
    delete process.env.OPS_ALERTA_DETENCION_MIN;

    const { load: oldLoad, shipment: oldShipment } = awarded("viejo");
    const { load: liveLoad, shipment: liveShipment } = awarded("reciente");
    pin(oldLoad.id, "2020-06-01T00:00:00.000Z");
    pin(liveLoad.id, new Date().toISOString());
    assert.equal(openCount(oldShipment.id, "sin_senal"), 0);
    process.env.OPS_ALERTAS_JOB_SECRET = JOB_SECRET;
    process.env.OPS_FEATURE_ENABLED = "TRUE";
    assert.equal((await job(JOB_SECRET)).status, 404);
    delete process.env.OPS_FEATURE_ENABLED;
    assert.equal((await job(JOB_SECRET)).status, 404);
    assert.equal(openCount(oldShipment.id, "sin_senal"), 0);
    process.env.OPS_FEATURE_ENABLED = "true";
    delete process.env.OPS_ALERTAS_JOB_SECRET;
    assert.equal((await job(JOB_SECRET)).status, 503);
    assert.equal(openCount(oldShipment.id, "sin_senal"), 0);
    process.env.OPS_ALERTAS_JOB_SECRET = JOB_SECRET;
    assert.equal((await job("otro-secreto-largo-de-prueba-xxxx")).status, 401);
    assert.equal(openCount(oldShipment.id, "sin_senal"), 0);
    const ran = await job(JOB_SECRET);
    assert.equal(ran.status, 200);
    const report = (await ran.json()) as { reviewed: number; opened: number; closed: number };
    assert.equal(report.reviewed >= 1, true);
    assert.equal(openCount(oldShipment.id, "sin_senal"), 1);
    assert.equal(openCount(liveShipment.id, "sin_senal"), 0);
    assert.equal(openCount(oldShipment.id, "detencion"), 0);
  } finally {
    if (previous.flag === undefined) delete process.env.OPS_FEATURE_ENABLED;
    else process.env.OPS_FEATURE_ENABLED = previous.flag;
    if (previous.detencion === undefined) delete process.env.OPS_ALERTA_DETENCION_MIN;
    else process.env.OPS_ALERTA_DETENCION_MIN = previous.detencion;
    if (previous.silent === undefined) delete process.env.OPS_ALERTA_SIN_SENAL_MIN;
    else process.env.OPS_ALERTA_SIN_SENAL_MIN = previous.silent;
    if (previous.secret === undefined) delete process.env.OPS_ALERTAS_JOB_SECRET;
    else process.env.OPS_ALERTAS_JOB_SECRET = previous.secret;
  }
});
