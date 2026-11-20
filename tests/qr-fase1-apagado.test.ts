import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { REQUIRED_CARRIER_DOCS } from "../src/lib/carrier";
import { getDb } from "../src/lib/db";
import { todayChile } from "../src/lib/format";
import { createLoad, createTruck } from "../src/lib/listings";
import { acceptOffer, submitOffer } from "../src/lib/offers";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";
import { qrFase1Enabled } from "../src/lib/qr/flag";
import { registerUser } from "../src/lib/auth";
import { advanceTrip, tripView } from "../src/lib/viaje";
import { middleware } from "../src/middleware";
import type { PublicUser } from "../src/lib/types";

let n = 0;

function rut(): string {
  n += 1;
  const body = String(50_000_000 + n * 7919);
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
    email: `${tag}-${n}@qr-off.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(10000000 + n).slice(0, 8)}`,
    city: "La Serena",
  }).user;
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(`UPDATE users SET email_verified_at = ?, verification_status = 'verificado' WHERE id = ?`).run(stamp, created.id);
  db.prepare(
    `UPDATE users SET phone_verified_at = ?, privacy_version = ?, privacy_accepted_at = ?, terms_version = ?, terms_accepted_at = ?, req_calidad = 'cumple', req_seguridad = 'cumple', req_medioambiente = 'no_aplica' WHERE id = ?`,
  ).run(stamp, PRIVACY_VERSION, stamp, TERMS_VERSION, stamp, created.id);
  if (role === "transportista") {
    for (const type of REQUIRED_CARRIER_DOCS) {
      db.prepare(
        `INSERT INTO documents (id, user_id, audience, type, holder_name, expiry, verification_status, created_at) VALUES (?, ?, ?, ?, 'Prueba', '2099-01-01', 'verificado', ?)`,
      ).run(randomUUID(), created.id, ["cedula", "licencia"].includes(type) ? "personal" : "camion", type, stamp);
    }
  }
  return { ...created, emailVerifiedAt: stamp, verificationStatus: "verificado" };
}

function hasTable(name: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

test("QR_FASE1_ENABLED solo se enciende con el texto exacto true", () => {
  const prev = process.env.QR_FASE1_ENABLED;
  try {
    delete process.env.QR_FASE1_ENABLED;
    assert.equal(qrFase1Enabled(), false);
    for (const value of ["", "false", "TRUE", "True", "1", "yes", " true", "true "]) {
      process.env.QR_FASE1_ENABLED = value;
      assert.equal(qrFase1Enabled(), false, value);
    }
    process.env.QR_FASE1_ENABLED = "true";
    assert.equal(qrFase1Enabled(), true);
  } finally {
    if (prev === undefined) delete process.env.QR_FASE1_ENABLED;
    else process.env.QR_FASE1_ENABLED = prev;
  }
});

test("con el flag apagado las rutas del QR responden 404 y la ficha de la carga no", async () => {
  const prev = process.env.QR_FASE1_ENABLED;
  try {
    delete process.env.QR_FASE1_ENABLED;
    const hidden = await middleware(new NextRequest("http://127.0.0.1:4317/viajes/carga-1/comprobante"));
    const api = await middleware(new NextRequest("http://127.0.0.1:4317/api/viajes/carga-1/trato/confirmar", { method: "POST" }));
    const bodega = await middleware(new NextRequest("http://127.0.0.1:4317/d/token-de-prueba"));
    assert.equal(hidden.status, 404);
    assert.equal(api.status, 404);
    assert.equal(bodega.status, 404);
    const carga = await middleware(new NextRequest("http://127.0.0.1:4317/cargas/carga-1"));
    assert.notEqual(carga.status, 404);
    process.env.QR_FASE1_ENABLED = "TRUE";
    const still = await middleware(new NextRequest("http://127.0.0.1:4317/viajes/carga-1/escanear"));
    assert.equal(still.status, 404);
    process.env.QR_FASE1_ENABLED = "";
    const empty = await middleware(new NextRequest("http://127.0.0.1:4317/api/d/token-de-prueba"));
    assert.equal(empty.status, 404);
  } finally {
    if (prev === undefined) delete process.env.QR_FASE1_ENABLED;
    else process.env.QR_FASE1_ENABLED = prev;
  }
});

test("con el flag apagado, aceptar una oferta funciona sin la migración 034", async () => {
  delete process.env.QR_FASE1_ENABLED;
  assert.equal(qrFase1Enabled(), false);
  const db = getDb();
  const versions = (db.prepare(`SELECT version FROM schema_migrations`).all() as { version: number }[]).map((row) => row.version);
  assert.equal(versions.includes(34), false);
  assert.equal(hasTable("trip_deals"), false);
  const truckCols = (db.prepare(`PRAGMA table_info(trucks)`).all() as { name: string }[]).map((column) => column.name);
  assert.equal(truckCols.includes("patente"), false);

  const owner = person("mandante", "dueno-off");
  const carrier = person("transportista", "flota-off");
  const truck = createTruck(carrier, {
    origin: "Santiago",
    destination: "Antofagasta",
    availableFrom: todayChile(),
    availableTo: addDays(10),
    equipment: "rampla_plana",
    tonnage: 28,
    specs: {},
    patente: "12",
  });
  assert.ok(truck.id);
  const load = createLoad(owner, {
    origin: "Quilicura",
    destination: "Antofagasta",
    pickupDate: addDays(2),
    equipment: "rampla_plana",
    description: "Carga sin QR",
    weightT: 12,
    specs: {},
  });
  const offer = await submitOffer(carrier, load.id, { priceClp: 900000, pickupDate: addDays(2), truckId: truck.id }, { notify: false });
  const accepted = await acceptOffer(owner, offer.offer.id);
  assert.equal(accepted?.status, "aceptada");
  const row = db.prepare(`SELECT status, awarded_offer_id, trip_status FROM loads WHERE id = ?`).get(load.id) as {
    status: string;
    awarded_offer_id: string;
    trip_status: string;
  };
  assert.equal(row.status, "adjudicada");
  assert.equal(row.awarded_offer_id, offer.offer.id);
  assert.equal(row.trip_status, "asignado");
  assert.equal(hasTable("trip_deals"), false);
  assert.equal((db.prepare(`SELECT version FROM schema_migrations WHERE version = 34`).get() as unknown) ?? null, null);

  const viaje = tripView(load.id, owner);
  assert.equal(Boolean(viaje?.retiroPorQr), false);
  assert.equal(viaje?.label, "Asignado");
  assert.equal(viaje?.next.some((step) => step.status === "retirado"), false);
  advanceTrip(carrier, load.id, "en_camino");
  const retirado = advanceTrip(owner, load.id, "retirado");
  assert.equal(retirado?.status, "retirado");
  assert.equal(retirado?.label, "Carga retirada");

  await new Promise((resolve) => setImmediate(resolve));
  const dir = process.env.MAIL_OUTBOX || "";
  const mails = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".txt"))
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8"));
  const carrierMail = mails.find((text) => text.includes("Tu oferta fue aceptada"));
  const ownerMail = mails.find((text) => text.includes("Adjudicaste tu carga"));
  assert.ok(carrierMail, "falta el correo al transportista");
  assert.ok(ownerMail, "falta el correo al mandante");
  assert.match(carrierMail, /Coordinen el retiro directamente\./);
  assert.doesNotMatch(carrierMail, /Confirma el trato|código de un solo uso|\/escanear/);
  assert.match(ownerMail, /Carga360go/);
  assert.doesNotMatch(ownerMail, /comprobante del trato|\/comprobante/);

  const page = fs.readFileSync(new URL("../src/app/cargas/[id]/page.tsx", import.meta.url), "utf8");
  const form = fs.readFileSync(new URL("../src/components/TruckForm.tsx", import.meta.url), "utf8");
  const board = fs.readFileSync(new URL("../src/components/TripBoard.tsx", import.meta.url), "utf8");
  assert.match(page, /qrFase1Enabled\(\)/);
  assert.match(form, /pedirPatente/);
  assert.match(board, /Estados declarados por los participantes\. No corresponde a ubicación GPS\./);
  assert.match(board, /viaje\.retiroPorQr/);
});
