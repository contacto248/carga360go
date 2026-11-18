import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { POST as postEvaluar } from "../src/app/api/ops/alertas/evaluar/route";
import { POST as postSenal } from "../src/app/api/ops/alertas/senal/route";
import { GET as getIncidencias, POST as postIncidencias } from "../src/app/api/ops/envios/[id]/incidencias/route";
import { PUT as putOperacion } from "../src/app/api/ops/envios/[id]/operacion/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { ensureBassamOps } from "../src/lib/bassam/ops";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { rutDv } from "../src/lib/format";
import { haversineM } from "../src/lib/costos/geometry";
import { createLoad } from "../src/lib/listings";
import { ensurePaymentsSchema } from "../src/lib/pagos/schema";
import { closeAlert, evaluateOperationAlerts, registerManualIncident } from "../src/lib/ops/operation-alerts";
import type { PublicUser } from "../src/lib/types";

const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../docs/especificaciones/seguimiento/fixtures_incidencias_EJEMPLO.json"), "utf8"),
) as { casos: { id: string; datos: Record<string, unknown> }[] };

function caso(id: string) {
  const found = fixtures.casos.find((item) => item.id === id);
  if (!found) throw new Error(`falta ${id}`);
  return found.datos;
}

let seq = 0;
function nextRut(): string {
  seq += 1;
  const body = String(21_500_000 + seq * 137).padStart(8, "0");
  return `${body}-${rutDv(body)}`;
}

function admin(): PublicUser {
  seq += 1;
  return upsertAdmin({
    email: `incidencias-${seq}@ops.test`,
    password: "Camino-Largo-2026",
    razonSocial: "Admin incidencias",
    rut: nextRut(),
    contactName: "Admin",
    whatsapp: `+56 9 ${String(51000000 + seq).padStart(8, "0")}`,
    city: "Santiago",
  });
}

function carrierUser(tag: string): PublicUser {
  seq += 1;
  const { user } = registerUser({
    role: "transportista",
    razonSocial: `Transportista ${tag}`,
    rut: nextRut(),
    contactName: tag,
    email: `${tag}-${seq}@ops-incidencias.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(52000000 + seq).padStart(8, "0")}`,
    city: "Calama",
  });
  return user;
}

const DESTINO = { lat: -23.6509, lng: -70.3975 };

function north(meters: number) {
  return { lat: DESTINO.lat + meters / 111_320, lng: DESTINO.lng };
}

let mandanteCache: PublicUser | null = null;
function mandante(): PublicUser {
  if (mandanteCache) return mandanteCache;
  seq += 1;
  const { user } = registerUser({
    role: "mandante",
    razonSocial: "Mandante incidencias",
    rut: nextRut(),
    contactName: "Mandante",
    email: `mandante-incidencias-${seq}@ops.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(53000000 + seq).padStart(8, "0")}`,
    city: "Calama",
  });
  mandanteCache = user;
  return user;
}

function shipment(stage: string, extra: { pickup?: string | null; delivery?: string | null; offer?: string | null; updated?: string } = {}) {
  ensureBassamOps();
  const load = createLoad(mandante(), {
    origin: "Calama",
    destination: "Antofagasta",
    pickupDate: "2026-11-20",
    equipment: "rampla_plana",
    description: "EJEMPLO incidencias",
    weightT: 10,
    specs: {},
  });
  const id = randomUUID();
  const stamp = extra.updated ?? "2026-11-18T12:00:00.000Z";
  getDb().prepare(
    `INSERT INTO ops_shipments (
      id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id,
      stage, planned_pickup_at, planned_delivery_at, created_at, updated_at
    ) VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
  ).run(id, load.id, extra.offer ?? null, stage, extra.pickup ?? null, extra.delivery ?? null, stamp, stamp);
  return { id, loadId: load.id };
}

function fence(shipmentId: string, point: "origen" | "destino", lat: number, lng: number, radius: number) {
  const stamp = "2026-11-18T12:00:00.000Z";
  getDb().prepare(
    `INSERT INTO ops_geofences (id, shipment_id, point, lat, lng, radius_m, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), shipmentId, point, lat, lng, radius, stamp, stamp);
}

function pin(loadId: string, lat: number, lng: number, at: string) {
  getDb().prepare(`INSERT INTO trip_gps_points (id, load_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?, ?)`).run(randomUUID(), loadId, lat, lng, at);
}

function openOf(shipmentId: string, kind: string) {
  return getDb().prepare(
    `SELECT id, severity, status, evidence_json, opened_at, updated_at, operation_id, closed_at, closed_by, close_reason
     FROM ops_operation_alerts WHERE shipment_id = ? AND kind = ? AND status = 'abierta'`,
  ).get(shipmentId, kind) as {
    id: string;
    severity: string;
    status: string;
    evidence_json: string;
    opened_at: string;
    updated_at: string;
    operation_id: string | null;
    closed_at: string | null;
    closed_by: string | null;
    close_reason: string | null;
  } | undefined;
}

function countKind(shipmentId: string, kind: string) {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM ops_operation_alerts WHERE shipment_id = ? AND kind = ? AND status = 'abierta'`).get(shipmentId, kind) as { n: number }).n;
}

test("CPI-01 desvio_geocerca abre al alejarse, no al acercarse, y el borde cuenta como dentro", () => {
  const positivo = caso("CPI-01-P");
  const geocerca = positivo.geocerca_destino as { lat: number; lng: number; radius_m: number };
  const lejos = shipment("ejecucion");
  fence(lejos.id, "destino", geocerca.lat, geocerca.lng, geocerca.radius_m);
  fence(lejos.id, "origen", -33.45, -70.66, 300);
  const horas = positivo.puntos_recorded_at as string[];
  [41_200, 42_050, 43_100].forEach((meters, index) => {
    const point = north(meters);
    pin(lejos.loadId, point.lat, point.lng, horas[index]);
  });
  evaluateOperationAlerts(new Date("2026-11-18T13:20:00.000Z"));
  const abierta = openOf(lejos.id, "desvio_geocerca");
  assert.ok(abierta);
  assert.equal(abierta.severity, "alta");
  const evidence = JSON.parse(abierta.evidence_json) as { distancias: number[] };
  assert.equal(evidence.distancias.length, 3);
  assert.ok(evidence.distancias[0] < evidence.distancias[1] && evidence.distancias[1] < evidence.distancias[2]);

  const cerca = shipment("ejecucion");
  fence(cerca.id, "destino", geocerca.lat, geocerca.lng, geocerca.radius_m);
  [43_100, 42_050, 41_200].forEach((meters, index) => {
    const point = north(meters);
    pin(cerca.loadId, point.lat, point.lng, horas[index]);
  });
  evaluateOperationAlerts(new Date("2026-11-18T13:20:00.000Z"));
  assert.equal(countKind(cerca.id, "desvio_geocerca"), 0);

  const borde = shipment("ejecucion");
  const onEdge = north(500);
  const distance = haversineM({ lat: onEdge.lat, lon: onEdge.lng }, { lat: DESTINO.lat, lon: DESTINO.lng });
  fence(borde.id, "destino", DESTINO.lat, DESTINO.lng, distance);
  pin(borde.loadId, DESTINO.lat, DESTINO.lng, "2026-11-18T13:00:00.000Z");
  pin(borde.loadId, onEdge.lat, onEdge.lng, "2026-11-18T13:05:00.000Z");
  evaluateOperationAlerts(new Date("2026-11-18T13:06:00.000Z"));
  assert.equal(countKind(borde.id, "desvio_geocerca"), 0);

  const salida = shipment("ejecucion");
  fence(salida.id, "destino", DESTINO.lat, DESTINO.lng, distance);
  const fuera = north(5_000);
  pin(salida.loadId, DESTINO.lat, DESTINO.lng, "2026-11-18T13:00:00.000Z");
  pin(salida.loadId, fuera.lat, fuera.lng, "2026-11-18T13:05:00.000Z");
  evaluateOperationAlerts(new Date("2026-11-18T13:06:00.000Z"));
  assert.equal(countKind(salida.id, "desvio_geocerca"), 1);
});

test("CPI-02 espera_destino abre a los 60 minutos dentro del destino y no con POD", () => {
  const datos = caso("CPI-02-P");
  const horas = datos.puntos_dentro_destino as string[];
  const larga = shipment("ejecucion");
  fence(larga.id, "destino", DESTINO.lat, DESTINO.lng, 500);
  pin(larga.loadId, DESTINO.lat, DESTINO.lng, horas[0]);
  pin(larga.loadId, DESTINO.lat, DESTINO.lng, horas[1]);
  evaluateOperationAlerts(new Date(horas[1]));
  const abierta = openOf(larga.id, "espera_destino");
  assert.ok(abierta);
  assert.equal(abierta.severity, "media");
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_alerts WHERE shipment_id = ? AND kind = 'detencion'`).get(larga.id) as { n: number }).n, 0);

  const conPod = shipment("ejecucion");
  fence(conPod.id, "destino", DESTINO.lat, DESTINO.lng, 500);
  pin(conPod.loadId, DESTINO.lat, DESTINO.lng, horas[0]);
  pin(conPod.loadId, DESTINO.lat, DESTINO.lng, horas[1]);
  ensurePaymentsSchema(getDb());
  const user = carrierUser("pod-espera");
  const payment = randomUUID();
  getDb().prepare(
    `INSERT INTO freight_payments (
      id, load_id, shipper_user_id, trucker_user_id, currency, freight_net_amount, freight_vat_amount,
      freight_gross_amount, anticipo_percent, anticipo_amount, saldo_amount, fee_payer, fee_rate_estimate, vat_rate,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'CLP', 1000, 190, 1190, 0, 0, 1190, 'shipper', 0, 0.19, ?, ?)`,
  ).run(payment, conPod.loadId, user.id, user.id, horas[0], horas[0]);
  getDb().prepare(
    `INSERT INTO pod_evidence (
      id, freight_payment_id, uploaded_by_user_id, kind, storage_key, content_type, size_bytes, checksum_sha256, created_at
    ) VALUES (?, ?, ?, 'foto_documento', 'test/pod', 'image/jpeg', 10, 'abc', ?)`,
  ).run(randomUUID(), payment, user.id, horas[1]);
  evaluateOperationAlerts(new Date(horas[1]));
  assert.equal(countKind(conPod.id, "espera_destino"), 0);

  const borde = caso("CPI-02-B");
  const exactas = borde.puntos_dentro_destino as string[];
  const justa = shipment("ejecucion");
  fence(justa.id, "destino", DESTINO.lat, DESTINO.lng, 500);
  pin(justa.loadId, DESTINO.lat, DESTINO.lng, exactas[0]);
  pin(justa.loadId, DESTINO.lat, DESTINO.lng, exactas[1]);
  evaluateOperationAlerts(new Date(exactas[1]));
  assert.equal(countKind(justa.id, "espera_destino"), 1);
  const corta = shipment("ejecucion");
  fence(corta.id, "destino", DESTINO.lat, DESTINO.lng, 500);
  pin(corta.loadId, DESTINO.lat, DESTINO.lng, "2026-11-18T13:00:00.000Z");
  pin(corta.loadId, DESTINO.lat, DESTINO.lng, "2026-11-18T13:59:00.000Z");
  evaluateOperationAlerts(new Date("2026-11-18T13:59:00.000Z"));
  assert.equal(countKind(corta.id, "espera_destino"), 0);
});

test("CPI-08 sin_asignar abre dentro de 1440 minutos y se cierra al asignar", () => {
  const positivo = caso("CPI-08-P");
  const abierta = shipment("asignacion", { pickup: String(positivo.planned_pickup_at) });
  evaluateOperationAlerts(new Date(String(positivo.ahora)));
  assert.equal(openOf(abierta.id, "sin_asignar")?.severity, "media");

  const negativo = caso("CPI-08-N");
  const lejos = shipment("asignacion", { pickup: String(negativo.planned_pickup_at) });
  evaluateOperationAlerts(new Date(String(negativo.ahora)));
  assert.equal(countKind(lejos.id, "sin_asignar"), 0);

  const borde = caso("CPI-08-B");
  const justo = shipment("asignacion", { pickup: String(borde.planned_pickup_at) });
  evaluateOperationAlerts(new Date(String(borde.ahora)));
  assert.equal(countKind(justo.id, "sin_asignar"), 1);
  const offer = randomUUID();
  getDb().prepare(`UPDATE ops_shipments SET assigned_offer_id = ? WHERE id = ?`).run(offer, justo.id);
  evaluateOperationAlerts(new Date(String(borde.ahora)));
  const cerrada = getDb().prepare(
    `SELECT status, close_reason, closed_at, closed_by FROM ops_operation_alerts WHERE shipment_id = ? AND kind = 'sin_asignar'`,
  ).get(justo.id) as { status: string; close_reason: string; closed_at: string; closed_by: string | null };
  assert.equal(cerrada.status, "cerrada");
  assert.equal(cerrada.close_reason, "condicion_resuelta");
  assert.ok(cerrada.closed_at);
  assert.equal(cerrada.closed_by, null);
});

test("CPI-09 retiro_no_iniciado abre a los 30 minutos sin posición en el origen", () => {
  const positivo = caso("CPI-09-P");
  const tarde = shipment("ejecucion", { pickup: String(positivo.planned_pickup_at), offer: randomUUID() });
  fence(tarde.id, "origen", -22.45, -68.92, 300);
  evaluateOperationAlerts(new Date(String(positivo.ahora)));
  assert.equal(openOf(tarde.id, "retiro_no_iniciado")?.severity, "alta");

  const negativo = caso("CPI-09-N");
  const llego = shipment("ejecucion", { pickup: String(negativo.planned_pickup_at), offer: randomUUID() });
  fence(llego.id, "origen", -22.45, -68.92, 300);
  const dentro = negativo.puntos_dentro_origen as string[];
  pin(llego.loadId, -22.45, -68.92, dentro[0]);
  evaluateOperationAlerts(new Date(String(negativo.ahora)));
  assert.equal(countKind(llego.id, "retiro_no_iniciado"), 0);

  const borde = caso("CPI-09-B");
  const justo = shipment("ejecucion", { pickup: String(borde.planned_pickup_at), offer: randomUUID() });
  fence(justo.id, "origen", -22.45, -68.92, 300);
  evaluateOperationAlerts(new Date(String(borde.ahora)));
  assert.equal(countKind(justo.id, "retiro_no_iniciado"), 1);
  const antes = shipment("ejecucion", { pickup: "2026-11-18T13:00:00.000Z", offer: randomUUID() });
  fence(antes.id, "origen", -22.45, -68.92, 300);
  evaluateOperationAlerts(new Date("2026-11-18T13:29:00.000Z"));
  assert.equal(countKind(antes.id, "retiro_no_iniciado"), 0);
});

test("CPI-06 documento_vencido compara con el día del retiro y el último día sigue vigente", () => {
  const user = admin();
  const carrier = carrierUser("soap");
  const transportista = randomUUID();
  const stamp = "2026-11-01T00:00:00.000Z";
  getDb().prepare(
    `INSERT INTO transportistas (id, user_id, estado, estado_admin, created_at, updated_at) VALUES (?, ?, 'activo', 'aprobado', ?, ?)`,
  ).run(transportista, carrier.id, stamp, stamp);
  const doc = randomUUID();
  getDb().prepare(
    `INSERT INTO documentos_acreditacion (id, tipo_cliente, transportista_id, tipo, vencimiento, estado_admin, created_at, updated_at)
     VALUES (?, 'transportista', ?, 'soap', '2026-11-15', 'aprobado', ?, ?)`,
  ).run(doc, transportista, stamp, stamp);
  const mandante = registerUser({
    role: "mandante",
    razonSocial: "Mandante soap",
    rut: nextRut(),
    contactName: "Mandante",
    email: `mandante-soap-${seq}@ops-incidencias.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 61112233",
    city: "Calama",
  }).user;
  const load = createLoad(mandante, {
    origin: "Calama",
    destination: "Antofagasta",
    pickupDate: "2026-11-18",
    equipment: "rampla_plana",
    description: "EJEMPLO",
    weightT: 10,
    specs: {},
  });
  const offer = randomUUID();
  getDb().prepare(
    `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, revisions, created_at, updated_at)
     VALUES (?, ?, ?, 1000, '2026-11-18', 'aceptada', 0, ?, ?)`,
  ).run(offer, load.id, carrier.id, stamp, stamp);
  const envio = shipment("asignacion", { pickup: "2026-11-18T13:00:00.000Z", offer });
  evaluateOperationAlerts(new Date("2026-11-18T12:00:00.000Z"));
  assert.equal(openOf(envio.id, "documento_vencido")?.severity, "alta");

  getDb().prepare(`UPDATE documentos_acreditacion SET vencimiento = '2026-12-31' WHERE id = ?`).run(doc);
  const vigente = shipment("asignacion", { pickup: "2026-11-18T13:00:00.000Z", offer });
  evaluateOperationAlerts(new Date("2026-11-18T12:00:00.000Z"));
  assert.equal(countKind(vigente.id, "documento_vencido"), 0);

  getDb().prepare(`UPDATE documentos_acreditacion SET vencimiento = '2026-11-18' WHERE id = ?`).run(doc);
  const mismoDia = shipment("asignacion", { pickup: "2026-11-18T13:00:00.000Z", offer });
  evaluateOperationAlerts(new Date("2026-11-18T12:00:00.000Z"));
  assert.equal(countKind(mismoDia.id, "documento_vencido"), 0);
  getDb().prepare(`UPDATE documentos_acreditacion SET vencimiento = '2026-11-17' WHERE id = ?`).run(doc);
  const ayer = shipment("asignacion", { pickup: "2026-11-18T13:00:00.000Z", offer });
  evaluateOperationAlerts(new Date("2026-11-18T12:00:00.000Z"));
  assert.equal(countKind(ayer.id, "documento_vencido"), 1);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_alerts WHERE shipment_id = ?`).get(ayer.id) as { n: number }).n, 0);
  void user;
});

test("CPI-12 evidencia_faltante abre en pod sin campos obligatorios y no guarda el valor", () => {
  const positivo = caso("CPI-12-P");
  const vacio = shipment("pod", { updated: String(positivo.desde) });
  evaluateOperationAlerts(new Date(String(positivo.ahora)));
  assert.equal(openOf(vacio.id, "evidencia_faltante")?.severity, "media");

  const completo = shipment("pod", { updated: "2026-11-18T13:00:00.000Z" });
  ensurePaymentsSchema(getDb());
  const user = carrierUser("pod-completo");
  const payment = randomUUID();
  const notes = JSON.stringify(caso("CPI-12-N").pod_evidence);
  getDb().prepare(
    `INSERT INTO freight_payments (
      id, load_id, shipper_user_id, trucker_user_id, currency, freight_net_amount, freight_vat_amount,
      freight_gross_amount, anticipo_percent, anticipo_amount, saldo_amount, fee_payer, fee_rate_estimate, vat_rate,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'CLP', 1000, 190, 1190, 0, 0, 1190, 'shipper', 0, 0.19, ?, ?)`,
  ).run(payment, completo.loadId, user.id, user.id, "2026-11-18T13:00:00.000Z", "2026-11-18T13:00:00.000Z");
  getDb().prepare(
    `INSERT INTO pod_evidence (
      id, freight_payment_id, uploaded_by_user_id, kind, storage_key, content_type, size_bytes, checksum_sha256, notes, created_at
    ) VALUES (?, ?, ?, 'foto_documento', 'test/pod', 'image/jpeg', 10, 'abc', ?, ?)`,
  ).run(randomUUID(), payment, user.id, notes, "2026-11-18T13:20:00.000Z");
  evaluateOperationAlerts(new Date("2026-11-18T16:00:00.000Z"));
  assert.equal(countKind(completo.id, "evidencia_faltante"), 0);

  const incompleto = shipment("pod", { updated: "2026-11-18T13:00:00.000Z" });
  const payment2 = randomUUID();
  const partial = JSON.stringify(caso("CPI-12-B").pod_evidence);
  getDb().prepare(
    `INSERT INTO freight_payments (
      id, load_id, shipper_user_id, trucker_user_id, currency, freight_net_amount, freight_vat_amount,
      freight_gross_amount, anticipo_percent, anticipo_amount, saldo_amount, fee_payer, fee_rate_estimate, vat_rate,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'CLP', 1000, 190, 1190, 0, 0, 1190, 'shipper', 0, 0.19, ?, ?)`,
  ).run(payment2, incompleto.loadId, user.id, user.id, "2026-11-18T13:00:00.000Z", "2026-11-18T13:00:00.000Z");
  getDb().prepare(
    `INSERT INTO pod_evidence (
      id, freight_payment_id, uploaded_by_user_id, kind, storage_key, content_type, size_bytes, checksum_sha256, notes, created_at
    ) VALUES (?, ?, ?, 'foto_documento', 'test/pod', 'image/jpeg', 10, 'abc', ?, ?)`,
  ).run(randomUUID(), payment2, user.id, partial, "2026-11-18T13:20:00.000Z");
  evaluateOperationAlerts(new Date("2026-11-18T15:00:00.000Z"));
  const row = openOf(incompleto.id, "evidencia_faltante");
  assert.ok(row);
  const evidence = JSON.parse(row.evidence_json) as { camposFaltantes: string[] };
  assert.ok(evidence.camposFaltantes.includes("rut_receptor"));
  assert.equal(row.evidence_json.includes("11.111"), false);
});

test("CPI-03, 04, 05 y 11 el registro manual redacta datos y no abre el siniestro solo", () => {
  const user = admin();
  const envio = shipment("ejecucion");
  getDb().prepare(
    `INSERT INTO ops_alerts (id, shipment_id, kind, status, severity, evidence_json, opened_at, updated_at)
     VALUES (?, ?, 'detencion', 'abierta', 'alta', '{}', ?, ?), (?, ?, 'sin_senal', 'abierta', 'alta', '{}', ?, ?)`,
  ).run(randomUUID(), envio.id, "2026-11-18T15:00:00.000Z", "2026-11-18T15:00:00.000Z", randomUUID(), envio.id, "2026-11-18T15:00:00.000Z", "2026-11-18T15:00:00.000Z");
  evaluateOperationAlerts(new Date("2026-11-18T15:30:00.000Z"));
  assert.equal(countKind(envio.id, "siniestro"), 0);

  const reporte = caso("CPI-03-B").reporte as { descripcion: string };
  const abierto = registerManualIncident(user, envio.id, { kind: "siniestro", reporte: { descripcion: reporte.descripcion, hora: "2026-11-18T15:20:00.000Z" } });
  assert.equal(abierto.alert?.kind, "siniestro");
  assert.equal(abierto.alert?.severity, "alta");
  assert.equal(abierto.alert?.evidence.escalar_a_jefe_bastian, true);
  const stored = JSON.stringify(abierto.alert?.evidence);
  assert.equal(stored.includes("11.111.111-1"), false);
  assert.equal(stored.includes("+56 9 0000 0000"), false);
  assert.equal(stored.includes("[dato personal omitido]"), true);

  const rechazo = shipment("ejecucion");
  const total = registerManualIncident(user, rechazo.id, { kind: "rechazo_entrega", reporte: caso("CPI-04-P").reporte });
  assert.equal(total.alert?.kind, "rechazo_entrega");
  const reparos = registerManualIncident(user, rechazo.id, { pod: caso("CPI-04-B").pod_evidence });
  assert.equal(reparos.alert?.kind, "entrega_con_reparos");
  assert.equal(countKind(rechazo.id, "rechazo_entrega"), 1);

  const conforme = shipment("pod");
  const nada = registerManualIncident(user, conforme.id, { pod: caso("CPI-05-N").pod_evidence });
  assert.equal(nada.alert, null);
  assert.equal(countKind(conforme.id, "entrega_con_reparos"), 0);
  const conMonto = registerManualIncident(user, conforme.id, { pod: { observaciones: "con reparos" }, reclamo_monto_clp: caso("CPI-05-B").reclamo_monto_clp });
  assert.equal(conMonto.alert?.kind, "entrega_con_reparos");
  assert.equal(conMonto.alert?.evidence.escalar_a_jefe_bastian, true);
  assert.equal(JSON.stringify(conMonto.alert?.evidence).includes("monto ficticio"), false);

  const silencio = shipment("ejecucion");
  const pocos = registerManualIncident(user, silencio.id, { kind: "sin_contacto", intentos_sin_respuesta: 1, respuesta: true });
  assert.equal(pocos.alert, null);
  const tres = registerManualIncident(user, silencio.id, { kind: "sin_contacto", intentos_sin_respuesta: caso("CPI-11-P").intentos_sin_respuesta });
  assert.equal(tres.alert?.kind, "sin_contacto");
  assert.equal(tres.alert?.severity, "alta");
  getDb().prepare(
    `INSERT INTO ops_alerts (id, shipment_id, kind, status, severity, evidence_json, opened_at, updated_at) VALUES (?, ?, 'sin_senal', 'abierta', 'alta', '{}', ?, ?)`,
  ).run(randomUUID(), silencio.id, "2026-11-18T15:00:00.000Z", "2026-11-18T15:00:00.000Z");
  const inmediato = registerManualIncident(user, silencio.id, { kind: "sin_contacto", intentos_sin_respuesta: 3 });
  assert.equal(inmediato.alert?.evidence.escalamiento, "inmediato");

  assert.throws(() => registerManualIncident(user, silencio.id, { kind: "cambio_no_verificado" }), (error: unknown) => error instanceof AppError);
  assert.equal(countKind(silencio.id, "cambio_no_verificado"), 0);
  assert.equal(countKind(silencio.id, "documento_faltante"), 0);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_operation_alerts WHERE kind IN ('atraso','detencion','sin_senal')`).get() as { n: number }).n, 0);
});

test("CPI-T03 una alerta abierta por tipo y el cierre guarda closed_at, closed_by y close_reason", () => {
  const user = admin();
  const envio = shipment("ejecucion", { pickup: "2026-11-18T13:00:00.000Z", offer: randomUUID() });
  fence(envio.id, "origen", -22.45, -68.92, 300);
  const now = new Date("2026-11-18T13:45:00.000Z");
  evaluateOperationAlerts(now);
  const first = openOf(envio.id, "retiro_no_iniciado");
  assert.ok(first);
  evaluateOperationAlerts(new Date("2026-11-18T14:00:00.000Z"));
  const second = openOf(envio.id, "retiro_no_iniciado");
  assert.ok(second);
  assert.equal(second.id, first.id);
  assert.equal(second.opened_at, first.opened_at);
  assert.notEqual(second.updated_at, first.updated_at);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_operation_alerts WHERE shipment_id = ? AND kind = 'retiro_no_iniciado' AND status = 'abierta'`).get(envio.id) as { n: number }).n, 1);
  const closed = closeAlert(user, envio.id, { id: first.id, reason: "resuelta_manual" });
  assert.equal(closed.closeReason, "resuelta_manual");
  assert.equal(closed.closedBy, user.id);
  assert.ok(closed.closedAt);
  const audit = getDb().prepare(`SELECT action FROM audit_log WHERE action = 'ops.incidencia_cerrada' AND target_id = ?`).get(envio.id);
  assert.ok(audit);
  const event = getDb().prepare(`SELECT kind FROM ops_events WHERE shipment_id = ? AND kind = 'incidencia.cerrada'`).get(envio.id);
  assert.ok(event);
});

test("CPI-T07 el operation_id de la alerta sale del envío y puede quedar vacío", async () => {
  const user = admin();
  const stamp = "2026-11-18T12:00:00.000Z";
  getDb().prepare(
    `INSERT INTO ops_operations (
      id, cliente, origen, destino, tipo_carga, peso_kg, estado, version, created_by, created_at, updated_at
    ) VALUES ('360-2611-9901', 'EJEMPLO', 'Calama', 'Antofagasta', 'General', 1000, 'planificada', 1, ?, ?, ?)`,
  ).run(user.id, stamp, stamp);
  const vinculado = shipment("ejecucion");
  const cookie = createSession(user.id, { mfa: true });
  const headers = new Headers({ host: "127.0.0.1:4317", "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: `${COOKIE_NAME}=${cookie}` });
  const previous = { master: process.env.OPS_FEATURE_ENABLED, child: process.env.OPS_INCIDENCIAS_ENABLED };
  process.env.OPS_FEATURE_ENABLED = "true";
  process.env.OPS_INCIDENCIAS_ENABLED = "true";
  try {
    const response = await putOperacion(new Request(`http://127.0.0.1:4317/api/ops/envios/${vinculado.id}/operacion`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ operationId: "360-2611-9901" }),
    }), { params: Promise.resolve({ id: vinculado.id }) });
    assert.equal(response.status, 200);
    const manual = registerManualIncident(user, vinculado.id, { kind: "siniestro", reporte: { descripcion: "Colisión menor (EJEMPLO)" } });
    assert.equal(manual.alert?.operationId, "360-2611-9901");
    const suelto = shipment("ejecucion");
    const sinVinculo = registerManualIncident(user, suelto.id, { kind: "siniestro", reporte: { descripcion: "Sin operación (EJEMPLO)" } });
    assert.equal(sinVinculo.alert?.operationId, null);
  } finally {
    if (previous.master === undefined) delete process.env.OPS_FEATURE_ENABLED;
    else process.env.OPS_FEATURE_ENABLED = previous.master;
    if (previous.child === undefined) delete process.env.OPS_INCIDENCIAS_ENABLED;
    else process.env.OPS_INCIDENCIAS_ENABLED = previous.child;
  }
});

function call(handler: (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>, path: string, method: string, params: Record<string, string>, cookie?: string, body?: unknown, authorization?: string) {
  const headers = new Headers({ host: "127.0.0.1:4317", "sec-fetch-site": "same-origin", accept: "application/json" });
  if (cookie) headers.set("cookie", `${COOKIE_NAME}=${cookie}`);
  if (authorization) headers.set("authorization", authorization);
  if (body) headers.set("content-type", "application/json");
  return handler(new Request(`http://127.0.0.1:4317${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), { params: Promise.resolve(params) });
}

test("CPI-T02 y CPI-T08 el flag distinto de true responde 404 y sin secreto el evaluador no abre", async () => {
  const previous = {
    master: process.env.OPS_FEATURE_ENABLED,
    child: process.env.OPS_INCIDENCIAS_ENABLED,
    secret: process.env.OPS_ALERTAS_JOB_SECRET,
  };
  const user = admin();
  const envio = shipment("ejecucion", { pickup: "2099-01-01T13:00:00.000Z", offer: randomUUID() });
  fence(envio.id, "origen", -22.45, -68.92, 300);
  const cookie = createSession(user.id, { mfa: true });
  const before = (getDb().prepare(`SELECT COUNT(*) AS n FROM ops_operation_alerts`).get() as { n: number }).n;
  try {
    for (const value of [undefined, "", "TRUE", "1", "false"]) {
      if (value === undefined) delete process.env.OPS_FEATURE_ENABLED;
      else process.env.OPS_FEATURE_ENABLED = value;
      delete process.env.OPS_INCIDENCIAS_ENABLED;
      delete process.env.OPS_ALERTAS_JOB_SECRET;
      assert.equal((await call(postEvaluar, "/api/ops/alertas/evaluar", "POST", {})).status, 404);
      assert.equal((await call(postIncidencias, `/api/ops/envios/${envio.id}/incidencias`, "POST", { id: envio.id }, cookie, { kind: "siniestro", reporte: { descripcion: "no" } })).status, 404);
      assert.equal((await call(putOperacion, `/api/ops/envios/${envio.id}/operacion`, "PUT", { id: envio.id }, cookie, { operationId: "360-2611-9901" })).status, 404);
    }
    process.env.OPS_FEATURE_ENABLED = "true";
    process.env.OPS_INCIDENCIAS_ENABLED = "TRUE";
    assert.equal((await call(getIncidencias, `/api/ops/envios/${envio.id}/incidencias`, "GET", { id: envio.id }, cookie)).status, 404);
    process.env.OPS_INCIDENCIAS_ENABLED = "true";
    delete process.env.OPS_ALERTAS_JOB_SECRET;
    assert.equal((await call(postEvaluar, "/api/ops/alertas/evaluar", "POST", {})).status, 404);
    assert.equal((await call(postSenal, "/api/ops/alertas/senal", "POST", {})).status, 503);
    assert.equal(countKind(envio.id, "retiro_no_iniciado"), 0);
    process.env.OPS_ALERTAS_JOB_SECRET = "secreto-distinto-de-24-caracteres";
    assert.equal((await call(postEvaluar, "/api/ops/alertas/evaluar", "POST", {}, undefined, undefined, "Bearer otro-secreto-que-no-coincide-24")).status, 401);
    const secret = "evaluador-incidencias-secreto-qa";
    process.env.OPS_ALERTAS_JOB_SECRET = secret;
    const ran = await call(postEvaluar, "/api/ops/alertas/evaluar", "POST", {}, undefined, undefined, `Bearer ${secret}`);
    assert.equal(ran.status, 200);
    assert.equal(countKind(envio.id, "retiro_no_iniciado"), 0);
    assert.equal(countKind(envio.id, "sin_senal"), 0);
    assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_operation_alerts`).get() as { n: number }).n >= before, true);
  } finally {
    if (previous.master === undefined) delete process.env.OPS_FEATURE_ENABLED;
    else process.env.OPS_FEATURE_ENABLED = previous.master;
    if (previous.child === undefined) delete process.env.OPS_INCIDENCIAS_ENABLED;
    else process.env.OPS_INCIDENCIAS_ENABLED = previous.child;
    if (previous.secret === undefined) delete process.env.OPS_ALERTAS_JOB_SECRET;
    else process.env.OPS_ALERTAS_JOB_SECRET = previous.secret;
  }
});
