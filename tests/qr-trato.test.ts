import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { REQUIRED_CARRIER_DOCS } from "../src/lib/carrier";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { todayChile } from "../src/lib/format";
import { createLoad, createTruck } from "../src/lib/listings";
import { acceptOffer, submitOffer } from "../src/lib/offers";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";
import { asignarChofer } from "../src/lib/qr/assignment";
import { confirmarTrato, emitirCodigoTrato, tratoExigeQr } from "../src/lib/qr/deal";
import { delegateLinkEnabled } from "../src/lib/qr/flag";
import { confirmarPoseedor, crearDelegado, entregaConformidad, entregaValidar, validarRetiro } from "../src/lib/qr/handoff";
import { buildComprobantePdf, datosComprobante } from "../src/lib/qr/pdf";
import { resolverPatente } from "../src/lib/qr/patente";
import {
  QR_STEP_SECONDS,
  backupCode,
  backupCodeMatches,
  issuePickupToken,
  masterKey,
  signToken,
  timeWindow,
  tripKey,
  verifySignature,
  windowFresh,
} from "../src/lib/qr/token";
import { registerUser } from "../src/lib/auth";
import { advanceTrip, tripView } from "../src/lib/viaje";
import { verifyChain } from "../src/lib/ops/shipments";
import type { PublicUser } from "../src/lib/types";

process.env.QR_MASTER_KEY = "clave-de-prueba-qr-fase-1-no-es-produccion";
process.env.QR_MASTER_KEY_ID = "k1";
process.env.QR_DELEGADO_ENABLED = "true";

const SECRET = process.env.QR_MASTER_KEY;
let n = 0;

function rut(): string {
  n += 1;
  const body = String(40_000_000 + n * 7919);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  return `${body}-${rest === 11 ? "0" : rest === 10 ? "K" : String(rest)}`;
}

function addDays(days: number): string {
  const [y, m, d] = todayChile().split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function person(role: "mandante" | "transportista", tag: string): PublicUser {
  const created = registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: `Contacto ${tag}`,
    email: `${tag}-${n}@qr.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(10000000 + n).slice(0, 8)}`,
    city: "La Serena",
  }).user;
  const stamp = new Date().toISOString();
  getDb().prepare(`UPDATE users SET email_verified_at = ?, verification_status = 'verificado' WHERE id = ?`).run(stamp, created.id);
  getDb()
    .prepare(
      `UPDATE users SET phone_verified_at = ?, privacy_version = ?, privacy_accepted_at = ?, terms_version = ?, terms_accepted_at = ?, req_calidad = 'cumple', req_seguridad = 'cumple', req_medioambiente = 'no_aplica' WHERE id = ?`,
    )
    .run(stamp, PRIVACY_VERSION, stamp, TERMS_VERSION, stamp, created.id);
  if (role === "transportista") {
    for (const type of REQUIRED_CARRIER_DOCS) {
      getDb()
        .prepare(
          `INSERT INTO documents (id, user_id, audience, type, holder_name, expiry, verification_status, created_at) VALUES (?, ?, ?, ?, 'Prueba', '2099-01-01', 'verificado', ?)`,
        )
        .run(randomUUID(), created.id, ["cedula", "licencia"].includes(type) ? "personal" : "camion", type, stamp);
    }
  }
  return { ...created, emailVerifiedAt: stamp, verificationStatus: "verificado" };
}

test("token: firma, ventana, claves y ausencia de datos personales", () => {
  const key = tripKey(Buffer.from(SECRET), "carga-1", "r", "abc", 1);
  const now = Date.parse("2026-11-20T15:00:00.000Z");
  const issued = issuePickupToken(key, "q7Hk2Mab", now);
  const ok = verifySignature(key, issued.token, "r");
  assert.equal("payload" in ok, true);
  if (!("payload" in ok)) return;
  assert.deepEqual(Object.keys(ok.payload).sort(), ["j", "k", "n", "v", "w"]);
  assert.equal(ok.payload.k, "r");
  assert.equal(ok.payload.j, "q7Hk2Mab");
  assert.equal(issued.token.includes("carga-1"), false);
  assert.equal(/rut|telefono|\+56|\$|clp|juan|antofagasta/i.test(issued.token), false);
  assert.equal(windowFresh(ok.payload.w, now), true);
  assert.equal(windowFresh(ok.payload.w, now + QR_STEP_SECONDS * 1000), true);
  assert.equal(windowFresh(ok.payload.w, now + QR_STEP_SECONDS * 2 * 1000), false);
  const tampered = `${issued.token.slice(0, -2)}aa`;
  const bad = verifySignature(key, tampered, "r");
  assert.equal("failure" in bad && bad.failure, "firma_invalida");
  const other = tripKey(Buffer.from(SECRET), "carga-1", "r", "abc", 2);
  assert.equal("failure" in verifySignature(other, issued.token, "r"), true);
  const code = backupCode(key, now);
  assert.match(code, /^\d{6}$/);
  assert.equal(backupCodeMatches(key, code, now), true);
  assert.equal(backupCodeMatches(key, code, now + QR_STEP_SECONDS * 1000), true);
  assert.equal(backupCodeMatches(key, code, now + QR_STEP_SECONDS * 3 * 1000), false);
  assert.equal(timeWindow(now), Math.floor(now / 1000 / 30));
  delete process.env.QR_MASTER_KEY;
  assert.throws(() => masterKey(), AppError);
  process.env.QR_MASTER_KEY = SECRET;
  const signed = signToken(key, { v: 1, k: "r", j: "q7Hk2Mab", w: timeWindow(now) - 2, n: "zzzzzzzz" });
  const stale = verifySignature(key, signed, "r");
  assert.equal("payload" in stale, true);
  if ("payload" in stale) assert.equal(windowFresh(stale.payload.w, now), false);
});

test("el enlace de bodega queda encendido en staging y apagado si se pide", () => {
  const prev = process.env.QR_DELEGADO_ENABLED;
  const app = process.env.APP_ENV;
  delete process.env.QR_DELEGADO_ENABLED;
  process.env.APP_ENV = "staging";
  assert.equal(delegateLinkEnabled(), true);
  process.env.APP_ENV = "production";
  assert.equal(delegateLinkEnabled(), false);
  process.env.QR_DELEGADO_ENABLED = "false";
  process.env.APP_ENV = "staging";
  assert.equal(delegateLinkEnabled(), false);
  process.env.QR_DELEGADO_ENABLED = prev;
  process.env.APP_ENV = app;
});

test("flujo: cierre, patente reutilizada, QR, reuso, intentos, reasignación y PDF", async () => {
  const owner = person("mandante", "dueno");
  const carrier = person("transportista", "flota");
  const load = createLoad(owner, {
    origin: "Quilicura",
    destination: "Antofagasta",
    pickupDate: addDays(2),
    equipment: "rampla_plana",
    description: "Carga de prueba QR",
    weightT: 12,
    specs: {},
  });
  const truck = createTruck(carrier, {
    origin: "Santiago",
    destination: "Antofagasta",
    availableFrom: todayChile(),
    availableTo: addDays(10),
    equipment: "rampla_plana",
    tonnage: 28,
    specs: {},
  });
  getDb().prepare(`UPDATE trucks SET specs_json = ? WHERE id = ?`).run(JSON.stringify({ patente: "KJTR42" }), truck.id);
  assert.equal(resolverPatente(truck.id).origen, "specs_json");
  const offer = await submitOffer(carrier, load.id, { priceClp: 1500000, pickupDate: addDays(2), truckId: truck.id }, { notify: false });
  await acceptOffer(owner, offer.offer.id, { notify: false });
  assert.equal(tratoExigeQr(load.id), false);
  const code = emitirCodigoTrato(carrier, load.id);
  const now = new Date();
  const closed = confirmarTrato(carrier, load.id, code, now);
  assert.match(closed.folio, /^360-\d{4}-\d{4}$/);
  assert.equal(tratoExigeQr(load.id), true);
  advanceTrip(carrier, load.id, "en_camino");
  assert.throws(() => advanceTrip(owner, load.id, "retirado"), /QR/);
  const assigned = asignarChofer(carrier, load.id, { nombre: "Juan Pérez", truckId: truck.id });
  assert.equal(assigned.patente, "KJTR42");
  assert.equal(assigned.nombre, "Juan P.");
  const column = getDb().prepare(`SELECT patente FROM trucks WHERE id = ?`).get(truck.id) as { patente: string };
  assert.equal(column.patente, "KJTR42");

  const deal = getDb().prepare(`SELECT public_ref, terms_hash FROM trip_deals WHERE load_id = ?`).get(load.id) as {
    public_ref: string;
    terms_hash: string;
  };
  const key = tripKey(masterKey().key, load.id, "r", deal.terms_hash, assigned.epoch);
  const clock = now.getTime();
  const stale = signToken(key, { v: 1, k: "r", j: deal.public_ref, w: timeWindow(clock) - 2, n: "vencido1" });
  assert.throws(() => validarRetiro(carrier, load.id, { token: stale, patente: "KJTR42" }, now), /venció/);
  const live = issuePickupToken(key, deal.public_ref, clock);
  const first = validarRetiro(carrier, load.id, { token: live.token, patente: "KJTR-42" }, now);
  assert.equal(first.ok, true);
  assert.throws(() => validarRetiro(carrier, load.id, { token: live.token, patente: "KJTR42" }, now), /ya se usó/);
  confirmarPoseedor(owner, load.id, "entrego", now);
  const seen = tripView(load.id, owner);
  assert.equal(seen?.status, "retirado");
  assert.equal(seen?.label, "Retiro validado");
  const pdf = buildComprobantePdf(datosComprobante(load.id, now)!);
  const text = pdf.toString("latin1");
  assert.match(text, new RegExp(closed.folio));
  assert.equal(text.includes("1500000"), false);
  assert.equal(text.includes("CLP"), false);
  assert.equal(/\bRUT\b|WhatsApp|\+56/i.test(text), false);
  const shipment = getDb().prepare(`SELECT id FROM ops_shipments WHERE load_id = ?`).get(load.id) as { id: string };
  assert.equal(verifyChain(shipment.id).ok, true);

  const stranger = person("transportista", "otro");
  assert.throws(() => validarRetiro(stranger, load.id, { token: live.token, patente: "KJTR42" }, now), /chofer|ya se usó|viaje/);
});

test("cinco códigos malos bloquean y una reasignación invalida el QR anterior", () => {
  const owner = person("mandante", "bloqueo");
  const carrier = person("transportista", "bloqueo");
  const load = createLoad(owner, {
    origin: "La Serena",
    destination: "Copiapó",
    pickupDate: addDays(3),
    equipment: "sider",
    description: "Carga para intentos",
    weightT: 8,
    specs: {},
  });
  const truck = createTruck(carrier, {
    origin: "La Serena",
    destination: "Copiapó",
    availableFrom: todayChile(),
    availableTo: addDays(12),
    equipment: "sider",
    tonnage: 20,
    specs: {},
    patente: "AB1234",
  });
  return submitOffer(carrier, load.id, { priceClp: 800000, pickupDate: addDays(3), truckId: truck.id }, { notify: false }).then(async (offer) => {
    await acceptOffer(owner, offer.offer.id, { notify: false });
    const code = emitirCodigoTrato(carrier, load.id);
    const now = new Date();
    confirmarTrato(carrier, load.id, code, now);
    const assigned = asignarChofer(carrier, load.id, { nombre: "Ana Soto", truckId: truck.id });
    advanceTrip(carrier, load.id, "en_camino");
    const deal = getDb().prepare(`SELECT public_ref, terms_hash FROM trip_deals WHERE load_id = ?`).get(load.id) as {
      public_ref: string;
      terms_hash: string;
    };
    const key = tripKey(masterKey().key, load.id, "r", deal.terms_hash, assigned.epoch);
    const fresh = issuePickupToken(key, deal.public_ref, now.getTime());
    asignarChofer(carrier, load.id, { nombre: "Ana Soto", truckId: truck.id, patente: "AB1234" });
    assert.throws(() => validarRetiro(carrier, load.id, { token: fresh.token, patente: "AB1234" }, now), /no es válido|camino/);
    for (let i = 0; i < 5; i += 1) {
      assert.throws(() => validarRetiro(carrier, load.id, { codigo: "000000", patente: "ZZ9999" }, now), /patente|intentos/);
    }
    assert.throws(() => validarRetiro(carrier, load.id, { codigo: "000000", patente: "AB1234" }, now), /15 minutos/);
    assert.throws(() => entregaValidar(), /fase 2/);
    assert.throws(() => entregaConformidad(), /fase 2/);
    const link = crearDelegado(owner, load.id, now);
    assert.match(link.path, /^\/d\//);
    process.env.QR_DELEGADO_ENABLED = "false";
    assert.throws(() => crearDelegado(owner, load.id, now), /No encontrado/);
    process.env.QR_DELEGADO_ENABLED = "true";
  });
});

test("un viaje antiguo sin trato QR sigue pudiendo marcar el retiro a mano", () => {
  const owner = person("mandante", "antiguo");
  const carrier = person("transportista", "antiguo");
  const loadId = randomUUID();
  const offerId = randomUUID();
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO loads (id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, specs_json, status, trip_status, created_at, updated_at)
     VALUES (?, ?, 'Iquique', 'Arica', ?, 'rampla_plana', 'Antigua', 8, '{}', 'adjudicada', 'en_camino', ?, ?)`,
  ).run(loadId, owner.id, addDays(1), stamp, stamp);
  db.prepare(
    `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, 'aceptada', ?, ?)`,
  ).run(offerId, loadId, carrier.id, addDays(1), stamp, stamp);
  db.prepare(`UPDATE loads SET awarded_offer_id = ? WHERE id = ?`).run(offerId, loadId);
  advanceTrip(owner, loadId, "retirado");
  assert.equal(tripView(loadId, owner)?.label, "Carga retirada");
});

test("la patente del documento se reutiliza si la columna y la ficha están vacías", () => {
  const carrier = person("transportista", "padron");
  const truck = createTruck(carrier, {
    origin: "Calama",
    destination: "Antofagasta",
    availableFrom: todayChile(),
    availableTo: addDays(4),
    equipment: "rampla_plana",
    tonnage: 15,
    specs: {},
  });
  getDb()
    .prepare(`UPDATE documents SET holder_name = ?, truck_id = ? WHERE user_id = ? AND type = 'padron'`)
    .run("Patente BBCD12", truck.id, carrier.id);
  const found = resolverPatente(truck.id);
  assert.equal(found.origen, "documento");
  assert.equal(found.patente, "BBCD12");
});

test("las pantallas QR no usan azul", () => {
  const files = [
    "src/app/qr.css",
    "src/components/qr/Pantallas.tsx",
    "src/components/qr/ComprobantesPanel.tsx",
    "src/lib/qr/pdf.ts",
  ];
  const banned = /#0b1633|#002451|#0e7490|#152647|#1a3358|#3ddc84|navy|blue/i;
  for (const file of files) {
    const text = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(banned.test(text), false, file);
  }
  const sql = fs.readFileSync(new URL("../docs/migrations/034-qr-trato.sql", import.meta.url), "utf8");
  assert.match(sql, /trip_deals/);
  assert.match(sql, /La 033 no se usa/);
  assert.equal(sql.includes("VALUES (33"), false);
});
