import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { GET as getBassam, POST as postBassam } from "../src/app/api/admin/bassam/route";
import { GET as getGps, POST as postGps } from "../src/app/api/viajes/[id]/gps/route";
import { GET as getQr } from "../src/app/api/viajes/[id]/qr/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { publicCheckpoint, bassamSnapshot, GPS_CLASIFICACION } from "../src/lib/bassam/ops";
import { approveByManager, evaluateQuality, qualityHistory, runQualityAgent } from "../src/lib/bassam/quality";
import { systemPrompt } from "../src/lib/assistant/prompt";
import { REQUIRED_CARRIER_DOCS } from "../src/lib/carrier";
import { getDb } from "../src/lib/db";
import { todayChile } from "../src/lib/format";
import { createLoad } from "../src/lib/listings";
import { acceptOffer, submitOffer } from "../src/lib/offers";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";
import type { PublicUser } from "../src/lib/types";

const ANTOFAGASTA = { lat: -23.6509, lng: -70.3975 };
const ctx = { params: Promise.resolve({}) };
let n = 900;

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
    email: `${tag}@bassam-panel.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(30000000 + n).padStart(8, "0")}`,
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

function req(path: string, method: string, token: string | null, body?: unknown) {
  const headers = new Headers({ host: "127.0.0.1:4317", "sec-fetch-site": "same-origin" });
  if (token) headers.set("cookie", `${COOKIE_NAME}=${token}`);
  if (body) headers.set("content-type", "application/json");
  return new Request(`http://127.0.0.1:4317${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

const admin = upsertAdmin({
  email: "bassam-admin@bassam-panel.test",
  password: "Camino-Largo-2026",
  razonSocial: "Admin panel",
  rut: rut(),
  contactName: "Admin",
  whatsapp: "+56 9 31112233",
  city: "La Serena",
});
const adminToken = createSession(admin.id, { mfa: true });

test("el panel vacío dice sin datos y no declara el GPS operativo", () => {
  const data = bassamSnapshot(admin);
  assert.equal(data.marca, "CARGA360GO");
  assert.equal(data.titulo, "BASSAM 360");
  assert.equal(data.conteos.viajes, "sin datos");
  assert.equal(data.conteos.eventos, "sin datos");
  assert.equal(data.conteos.gps, "sin datos");
  assert.equal(data.conteos.autorizaciones, "sin datos");
  assert.equal(data.informe.texto, "sin datos");
  assert.equal(data.torre.length, 0);
  assert.equal(data.gpsClasificacion, "Probada en test");
  assert.notEqual(data.gpsClasificacion, "Operativa");
  assert.equal(GPS_CLASIFICACION, "Probada en test");
});

test("autorizar, rechazar y solicitar revisión quedan auditados; el GPS solo entra en el viaje autorizado", async () => {
  const owner = person("mandante", "dueno");
  const carrier = person("transportista", "chofer");
  const stranger = person("transportista", "ajeno");
  const load = createLoad(owner, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(4),
    equipment: "rampla_plana",
    description: "Pallets de prueba",
    weightT: 12,
    specs: {},
  });
  const offer = await submitOffer(carrier, load.id, { priceClp: 900000, pickupDate: addDays(4) }, { notify: false });
  await acceptOffer(owner, offer.offer.id, { notify: false });

  const blocked = await postGps(req(`/api/viajes/${load.id}/gps`, "POST", createSession(carrier.id), ANTOFAGASTA), { params: Promise.resolve({ id: load.id }) });
  assert.equal(blocked.status, 403);

  const other = await postGps(req(`/api/viajes/${load.id}/gps`, "POST", createSession(stranger.id), ANTOFAGASTA), { params: Promise.resolve({ id: load.id }) });
  assert.equal(other.status, 403);

  const anon = await postGps(req(`/api/viajes/${load.id}/gps`, "POST", null, ANTOFAGASTA), { params: Promise.resolve({ id: load.id }) });
  assert.equal(anon.status, 401);

  for (const action of ["autorizar", "rechazar", "solicitar_revision"] as const) {
    const response = await postBassam(req("/api/admin/bassam", "POST", adminToken, { loadId: load.id, action }), ctx);
    assert.equal(response.status, 200);
    const audit = getDb().prepare(`SELECT action, actor_id FROM audit_log WHERE action = ? AND target_id = ?`).get(`bassam.${action}`, load.id) as { action: string; actor_id: string };
    assert.equal(audit.actor_id, admin.id);
  }

  const denied = await postGps(req(`/api/viajes/${load.id}/gps`, "POST", createSession(carrier.id), ANTOFAGASTA), { params: Promise.resolve({ id: load.id }) });
  assert.equal(denied.status, 403);

  await postBassam(req("/api/admin/bassam", "POST", adminToken, { loadId: load.id, action: "autorizar" }), ctx);
  const saved = await postGps(req(`/api/viajes/${load.id}/gps`, "POST", createSession(carrier.id), { ...ANTOFAGASTA, recordedAt: "1999-01-01T00:00:00.000Z", email: owner.email }), { params: Promise.resolve({ id: load.id }) });
  assert.equal(saved.status, 201);
  const point = await saved.json();
  assert.equal(point.lat, ANTOFAGASTA.lat);
  assert.equal(point.lng, ANTOFAGASTA.lng);
  assert.match(point.recordedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.notEqual(point.recordedAt, "1999-01-01T00:00:00.000Z");
  assert.equal(point.clasificacion, "Probada en test");
  assert.equal("email" in point, false);
  assert.equal("Operativa" in point, false);

  const columns = getDb().prepare(`PRAGMA table_info(trip_gps_points)`).all() as { name: string }[];
  assert.deepEqual(columns.map((column) => column.name).sort(), ["id", "lat", "lng", "load_id", "recorded_at"]);
  const row = getDb().prepare(`SELECT lat, lng, recorded_at FROM trip_gps_points WHERE load_id = ?`).get(load.id) as { lat: number; lng: number; recorded_at: string };
  assert.equal(row.lat, ANTOFAGASTA.lat);
  assert.equal(row.lng, ANTOFAGASTA.lng);
  assert.equal(row.recorded_at, point.recordedAt);

  const listed = await getGps(req(`/api/viajes/${load.id}/gps`, "GET", createSession(owner.id)), { params: Promise.resolve({ id: load.id }) });
  const body = await listed.json();
  assert.equal(body.points.length, 1);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(owner.email, "i"));

  const outside = await postGps(req(`/api/viajes/${load.id}/gps`, "POST", createSession(carrier.id), { lat: 0, lng: 0 }), { params: Promise.resolve({ id: load.id }) });
  assert.equal(outside.status, 400);

  const panel = bassamSnapshot(admin);
  assert.equal(panel.conteos.viajes, "1");
  assert.notEqual(panel.conteos.gps, "sin datos");
  assert.equal(panel.informe.texto, "datos reales");
  if (panel.informe.texto !== "datos reales") return;
  const viaje = panel.informe.viajes.find((item) => item.id === load.id);
  assert.ok(viaje);
  assert.ok(viaje.historial.length > 0);
  assert.equal(viaje.gps[0]?.lat, ANTOFAGASTA.lat);
  assert.equal(viaje.autorizacion, "autorizada");
  assert.doesNotMatch(JSON.stringify(panel), new RegExp(owner.email, "i"));
  assert.doesNotMatch(JSON.stringify(panel), /password|whatsapp/i);
});

test("el QR de origen y destino no lleva datos personales", async () => {
  const owner = person("mandante", "qr-dueno");
  const carrier = person("transportista", "qr-chofer");
  const load = createLoad(owner, {
    origin: "Antofagasta",
    destination: "Santiago",
    pickupDate: addDays(5),
    equipment: "rampla_plana",
    description: "Carga QR",
    weightT: 8,
    specs: {},
  });
  const offer = await submitOffer(carrier, load.id, { priceClp: 800000, pickupDate: addDays(5) }, { notify: false });
  await acceptOffer(owner, offer.offer.id, { notify: false });
  const response = await getQr(req(`/api/viajes/${load.id}/qr`, "GET", createSession(carrier.id)), { params: Promise.resolve({ id: load.id }) });
  assert.equal(response.status, 200);
  const qr = await response.json();
  const packed = JSON.stringify(qr);
  for (const secret of [owner.email, carrier.email, owner.contactName, owner.razonSocial, owner.rut, carrier.whatsapp]) {
    assert.equal(packed.toLowerCase().includes(String(secret).toLowerCase()), false, secret);
  }
  assert.match(qr.origen.url, /\/v\/[A-Za-z0-9_-]+$/);
  assert.match(qr.destino.url, /\/v\/[A-Za-z0-9_-]+$/);
  assert.notEqual(qr.origen.url, qr.destino.url);
  assert.match(qr.origen.svg, /<svg/);
  const token = qr.origen.url.split("/v/")[1];
  const view = publicCheckpoint(token);
  assert.equal(view?.pointLabel, "Origen");
  assert.equal(view?.origin, "Antofagasta");
  assert.equal(view?.destination, "Santiago");
  assert.deepEqual(Object.keys(view ?? {}).sort(), ["destination", "origin", "point", "pointLabel", "tripLabel"]);
  assert.equal(publicCheckpoint("no-existe"), null);
  const stranger = person("mandante", "qr-ajeno");
  assert.equal((await getQr(req(`/api/viajes/${load.id}/qr`, "GET", createSession(stranger.id)), { params: Promise.resolve({ id: load.id }) })).status, 403);
});

test("la API del panel exige administrador con segundo factor", async () => {
  assert.equal((await getBassam(req("/api/admin/bassam", "GET", null), ctx)).status, 401);
  const plain = person("mandante", "no-admin");
  assert.equal((await getBassam(req("/api/admin/bassam", "GET", createSession(plain.id)), ctx)).status, 403);
  assert.equal((await getBassam(req("/api/admin/bassam", "GET", createSession(admin.id)), ctx)).status, 401);
  const ok = await getBassam(req("/api/admin/bassam", "GET", adminToken), ctx);
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.marca, "CARGA360GO");
  assert.equal(data.titulo, "BASSAM 360");
  const cross = new Request("http://127.0.0.1:4317/api/admin/bassam", {
    method: "POST",
    headers: { host: "127.0.0.1:4317", origin: "https://otro.example", cookie: `${COOKIE_NAME}=${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ loadId: randomUUID(), action: "autorizar" }),
  });
  assert.equal((await postBassam(cross, ctx)).status, 403);
});

test("el asistente ejecutivo usa el mismo prompt y el botón está sobre el chat existente", () => {
  const live = { activeLoads: 0, activeTrucks: 0, recentLoads: [], recentTrucks: [] };
  const plain = systemPrompt(live, "web");
  const executive = systemPrompt(live, "web", true);
  assert.equal(plain.includes("Modo ejecutivo"), false);
  assert.match(executive, /sin datos/);
  assert.equal(executive.includes("manychat"), false);
  // Decisión Gerencia 16-11: el chat flotante antiguo se retiró (T-064); el modo ejecutivo vive en VoiceAgent, solo en /admin/bassam.
  const voice = fs.readFileSync(new URL("../src/components/VoiceAgent.tsx", import.meta.url), "utf8");
  assert.match(voice, /Asistente ÓRBITA/);
  assert.doesNotMatch(voice, /Asistente IA ejecutivo/);
  assert.match(voice, /executive: true/);
  assert.match(voice, /\/admin\/bassam/);
  const whatsapp = fs.readFileSync(new URL("../src/lib/whatsapp/config.ts", import.meta.url), "utf8");
  assert.match(whatsapp, /WA_PROVIDER=meta/);
  assert.doesNotMatch(whatsapp, /manychat/i);
  const page = fs.readFileSync(new URL("../src/app/admin/bassam/page.tsx", import.meta.url), "utf8");
  assert.match(page, /CARGA360GO/);
  assert.match(page, /BASSAM 360/);
  const panel = fs.readFileSync(new URL("../src/components/BassamPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /viaje\.necesitaGerente \?/);
  assert.match(panel, />\s*Aprobado\s*</);
  const rules = fs.readFileSync(new URL("../src/lib/bassam/quality.ts", import.meta.url), "utf8");
  assert.doesNotMatch(rules, /openai|gemini|AI_API_KEY|manychat/i);
});

test("el agente de calidad resuelve lo rutinario y Aprobado solo existe si la severidad es muy alta", async () => {
  const routine = evaluateQuality({ tripStatus: "asignado", origin: "La Serena", destination: "Santiago", eventCount: 1, gpsCount: 0, hasCarrier: true });
  assert.equal(routine.needsManager, false);
  assert.equal(routine.severity, "baja");
  assert.equal(routine.ruleId, "rutina-sin-excepcion");
  const critical = evaluateQuality({ tripStatus: "incidencia", origin: "La Serena", destination: "Santiago", eventCount: 2, gpsCount: 0, hasCarrier: true });
  assert.equal(critical.needsManager, true);
  assert.equal(critical.severity, "muy_alta");
  const emptyHistory = evaluateQuality({ tripStatus: "asignado", origin: "La Serena", destination: "Santiago", eventCount: 0, gpsCount: 0, hasCarrier: true });
  assert.equal(emptyHistory.result, "sin datos");
  assert.equal(emptyHistory.needsManager, false);

  const owner = person("mandante", "qa-dueno");
  const carrier = person("transportista", "qa-chofer");
  const load = createLoad(owner, {
    origin: "Copiapó",
    destination: "Calama",
    pickupDate: addDays(6),
    equipment: "rampla_plana",
    description: "Revisión de calidad",
    weightT: 9,
    specs: {},
  });
  const offer = await submitOffer(carrier, load.id, { priceClp: 700000, pickupDate: addDays(6) }, { notify: false });
  await acceptOffer(owner, offer.offer.id, { notify: false });

  runQualityAgent(admin);
  runQualityAgent(admin);
  const first = qualityHistory().filter((row) => row.loadId === load.id);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.actor, "agente_calidad");
  assert.equal(first[0]?.decision, "resuelto");
  assert.equal(first[0]?.ruleId, "rutina-sin-excepcion");
  assert.match(first[0]?.at ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await postBassam(req("/api/admin/bassam", "POST", adminToken, { loadId: load.id, action: "aprobado" }), ctx)).status, 409);

  getDb().prepare(`UPDATE loads SET trip_status = 'incidencia' WHERE id = ?`).run(load.id);
  const snap = bassamSnapshot(admin);
  const viaje = snap.torre.find((item) => item.id === load.id);
  assert.equal(viaje?.necesitaGerente, true);
  assert.equal(viaje?.severidad, "muy_alta");
  assert.equal(viaje?.regla, "incidencia-abierta");
  const approved = await postBassam(req("/api/admin/bassam", "POST", adminToken, { loadId: load.id, action: "aprobado" }), ctx);
  assert.equal(approved.status, 200);
  const history = qualityHistory().filter((row) => row.loadId === load.id);
  const manager = history.find((row) => row.actor === "gerente");
  assert.equal(manager?.decision, "aprobado");
  assert.equal(manager?.ruleId, "incidencia-abierta");
  assert.equal(manager?.result, "Aprobado por gerencia.");
  assert.match(manager?.at ?? "", /^\d{4}-\d{2}-\d{2}T/);
  runQualityAgent(admin);
  assert.equal(qualityHistory().filter((row) => row.loadId === load.id && row.decision === "pendiente_gerente").length, 1);
  const after = bassamSnapshot(admin).torre.find((item) => item.id === load.id);
  assert.equal(after?.necesitaGerente, false);
  assert.throws(() => approveByManager(admin, load.id), /muy alta/);
});
