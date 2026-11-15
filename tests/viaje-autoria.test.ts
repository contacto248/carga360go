import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { REQUIRED_CARRIER_DOCS } from "../src/lib/carrier";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";
import { registerUser } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { todayChile } from "../src/lib/format";
import { createLoad } from "../src/lib/listings";
import { acceptOffer, submitOffer } from "../src/lib/offers";
import { TRIP_LABEL, advanceTrip, tripView } from "../src/lib/viaje";
import type { PublicUser } from "../src/lib/types";

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
  const r = 11 - (sum % 11);
  return `${body}-${r === 11 ? "0" : r === 10 ? "K" : String(r)}`;
}

function person(role: "mandante" | "transportista", tag: string): PublicUser {
  const { user: created } = registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: `Contacto ${tag}`,
    email: `${tag}@viaje-autoria.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(20000000 + n).slice(0, 8)}`,
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

test("el historial muestra el rol del autor y oculta la identidad", async () => {
  const owner = person("mandante", "dueno");
  const carrier = person("transportista", "chofer");
  const stranger = person("transportista", "ajeno");
  const admin = person("mandante", "admin");
  getDb().prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(admin.id);
  admin.role = "admin";

  const load = createLoad(owner, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(3),
    equipment: "rampla_plana",
    description: "Pallets de prueba",
    weightT: 10,
    specs: {},
  });
  const offer = await submitOffer(carrier, load.id, { priceClp: 850000, pickupDate: addDays(3) }, { notify: false });
  await acceptOffer(owner, offer.offer.id, { notify: false });

  const awarded = tripView(load.id, owner);
  assert.ok(awarded);
  assert.equal(awarded.events[0]?.authorLabel, "Mandante");
  assert.equal(tripView(load.id, carrier)?.events[0]?.authorLabel, "Mandante");

  advanceTrip(carrier, load.id, "en_camino");
  advanceTrip(owner, load.id, "retirado");
  advanceTrip({ ...admin, role: "admin" }, load.id, "en_transito");
  advanceTrip(carrier, load.id, "entregado", "Llegó al patio");

  const seen = tripView(load.id, owner);
  assert.ok(seen);
  assert.deepEqual(
    seen.events.map((event) => event.authorLabel),
    ["Mandante", "Transportista", "Mandante", "Administrador", "Transportista"],
  );
  assert.equal(seen.label, "Entrega declarada");
  assert.equal(seen.events.at(-1)?.label, "Entrega declarada");
  assert.equal(seen.events.at(-1)?.note, "Llegó al patio");
  assert.equal(JSON.stringify(seen).includes("comprobante"), false);
  assert.equal(JSON.stringify(seen).includes(owner.email), false);
  assert.equal(JSON.stringify(seen).includes(carrier.email), false);
  assert.equal(JSON.stringify(seen).includes("actorId"), false);
  assert.equal(JSON.stringify(seen).includes("actor_id"), false);
  for (const event of seen.events) {
    assert.equal("actorRole" in event, false);
    assert.equal("actorId" in event, false);
  }

  const outsider = tripView(load.id, stranger);
  assert.equal(outsider, null);

  const guest = tripView(load.id, null);
  assert.equal(guest, null);

  const rules = fs.readFileSync(new URL("../src/lib/viaje.ts", import.meta.url), "utf8");
  assert.match(rules, /asignado: \["en_camino", "incidencia"\]/);
  assert.match(rules, /entregado: \[\]/);
  assert.equal(TRIP_LABEL.entregado, "Entrega declarada");
});

test("un evento antiguo sin autor no se atribuye a quien consulta", () => {
  const owner = person("mandante", "antiguo");
  const carrier = person("transportista", "antiguo-chofer");
  const loadId = randomUUID();
  const offerId = randomUUID();
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO loads (id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, specs_json, status, trip_status, created_at, updated_at)
     VALUES (?, ?, 'Iquique', 'Arica', ?, 'rampla_plana', 'Antigua', 8, '{}', 'adjudicada', 'en_transito', ?, ?)`,
  ).run(loadId, owner.id, addDays(1), stamp, stamp);
  db.prepare(
    `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, 'aceptada', ?, ?)`,
  ).run(offerId, loadId, carrier.id, addDays(1), stamp, stamp);
  db.prepare(`UPDATE loads SET awarded_offer_id = ? WHERE id = ?`).run(offerId, loadId);
  db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, NULL, 'en_transito', NULL, ?)`).run(
    randomUUID(),
    loadId,
    stamp,
  );

  const byOwner = tripView(loadId, owner);
  const byCarrier = tripView(loadId, carrier);
  assert.equal(byOwner?.events[0]?.authorLabel, "Autor no disponible");
  assert.equal(byCarrier?.events[0]?.authorLabel, "Autor no disponible");
  assert.notEqual(byOwner?.events[0]?.authorLabel, "Mandante");
  assert.notEqual(byCarrier?.events[0]?.authorLabel, "Transportista");
});

test("el tablero declara que el estado no es GPS y no habla de comprobante", () => {
  const board = fs.readFileSync(new URL("../src/components/TripBoard.tsx", import.meta.url), "utf8");
  assert.match(board, /Estados declarados por los participantes\. No corresponde a ubicación GPS\./);
  assert.equal(board.includes("comprobante"), false);
  assert.match(board, /event\.authorLabel/);
});
