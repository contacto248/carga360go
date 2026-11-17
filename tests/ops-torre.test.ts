import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { PUT as putAlertas, GET as getAlertas } from "../src/app/api/ops/envios/[id]/alertas/route";
import { GET as getEta } from "../src/app/api/ops/envios/[id]/eta/route";
import { GET as getEvaluar } from "../src/app/api/ops/envios/[id]/geocercas/evaluar/route";
import { POST as postGeocercas } from "../src/app/api/ops/envios/[id]/geocercas/route";
import { POST as postSeguimiento } from "../src/app/api/ops/envios/[id]/seguimiento/route";
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
    const repeat = await call(postSeguimiento, `/api/ops/envios/${shipment.id}/seguimiento`, "POST", { id: shipment.id }, adminCookie);
    assert.equal(repeat.status, 200);
    assert.equal(((await repeat.json()) as { token: string }).token, link.token);
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
