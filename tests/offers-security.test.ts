import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { REQUIRED_CARRIER_DOCS } from "../src/lib/carrier";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";
import { assertSameOrigin } from "../src/lib/api";
import { listAudit } from "../src/lib/audit";
import { registerUser, resetPassword } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { addDocument } from "../src/lib/documents";
import { AppError } from "../src/lib/errors";
import { todayChile } from "../src/lib/format";
import { createLoad, getLoad, listLoads, updateLoad } from "../src/lib/listings";
import { acceptOffer, canOffer, closeLoad, listOffersForLoad, offersVisibleTo, submitOffer, withdrawOffer } from "../src/lib/offers";
import { assertHuman, assertStrongPassword, cleanClp, normalizePatente } from "../src/lib/security";
import { getSettings, saveSettings } from "../src/lib/settings";
import type { PublicUser } from "../src/lib/types";

let n = 0;
function rut(): string {
  // RUT válido con dígito verificador calculado (módulo 11).
  n += 1;
  const body = String(30_000_000 + n * 7919);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return `${body}-${r === 11 ? "0" : r === 10 ? "K" : String(r)}`;
}

function user(role: "mandante" | "transportista", tag: string, approved = true): PublicUser {
  const { user: created } = registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: `Contacto ${tag}`,
    email: `${tag}@ofertas.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(10000000 + n).slice(0, 8)}`,
    city: "La Serena",
  });
  const stamp = new Date().toISOString();
  getDb()
    .prepare(`UPDATE users SET email_verified_at = ?, verification_status = ? WHERE id = ?`)
    .run(stamp, approved ? "verificado" : "pendiente", created.id);
  if (approved) accreditForTest(created.id, role);
  return { ...created, emailVerifiedAt: stamp, verificationStatus: approved ? "verificado" : "pendiente" };
}

/** Deja la cuenta 100% acreditada: privacidad, teléfono, requisitos y (transportistas) documentos aprobados y vigentes. */
function accreditForTest(id: string, role: string) {
  const db = getDb();
  const stamp = new Date().toISOString();
  db.prepare(
    `UPDATE users SET phone_verified_at = ?, privacy_version = ?, privacy_accepted_at = ?, terms_version = ?, terms_accepted_at = ?, req_calidad = 'cumple', req_seguridad = 'cumple', req_medioambiente = 'no_aplica' WHERE id = ?`,
  ).run(stamp, PRIVACY_VERSION, stamp, TERMS_VERSION, stamp, id);
  if (role !== "transportista") return;
  for (const type of REQUIRED_CARRIER_DOCS) {
    db.prepare(
      `INSERT INTO documents (id, user_id, audience, type, holder_name, expiry, verification_status, created_at) VALUES (?, ?, ?, ?, ?, '2099-01-01', 'verificado', ?)`,
    ).run(randomUUID(), id, ["cedula", "licencia"].includes(type) ? "personal" : "camion", type, "Prueba", stamp);
  }
}

function addDays(days: number): string {
  const [y, m, d] = todayChile().split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function load(owner: PublicUser, extra: Record<string, unknown> = {}) {
  return createLoad(owner, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(3),
    equipment: "rampla_plana",
    description: "Pallets de prueba",
    weightT: 10,
    specs: {},
    ...extra,
  });
}

test("seguridad: contraseña, patente, montos, honeypot y CSRF", () => {
  assert.throws(() => assertStrongPassword("corta"), AppError);
  assert.throws(() => assertStrongPassword("1234567890"), /común/);
  assert.throws(() => assertStrongPassword("aaaaaaaaaaaa"), AppError);
  assert.throws(() => assertStrongPassword("juanperez-2026", "juanperez@x.cl"), /correo/);
  assert.doesNotThrow(() => assertStrongPassword("Camino-Largo-2026"));

  assert.equal(normalizePatente("bb-cd 12"), "BBCD12");
  assert.equal(normalizePatente("AB·1234"), "AB1234");
  assert.equal(normalizePatente("12ABCD"), null);
  assert.equal(normalizePatente("X1"), null);

  assert.equal(cleanClp("", "El precio", false), null);
  assert.throws(() => cleanClp(0, "El precio", true), AppError);
  assert.throws(() => cleanClp(-5, "El precio", true), AppError);
  assert.throws(() => cleanClp(1.5, "El precio", true), AppError);
  assert.equal(cleanClp(1, "El precio", true), 1);
  assert.equal(cleanClp(5000, "El precio", true), 5000);
  assert.equal(cleanClp(999_999_999_999, "El precio", true), 999_999_999_999);
  assert.throws(() => cleanClp("abc", "El precio", true), AppError);
  assert.equal(cleanClp("850.000", "El precio", true), 850000);

  assert.throws(() => assertHuman({ website: "http://spam" }), AppError);
  assert.throws(() => assertHuman({ formStartedAt: Date.now() }), AppError);
  assert.doesNotThrow(() => assertHuman({ website: "", formStartedAt: Date.now() - 10_000 }));

  const cross = new Request("https://www.carga360go.cl/api/cargas", { method: "POST", headers: { "sec-fetch-site": "cross-site", host: "www.carga360go.cl" } });
  assert.throws(() => assertSameOrigin(cross), /Origen/);
  const same = new Request("https://www.carga360go.cl/api/cargas", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", origin: "https://www.carga360go.cl", host: "www.carga360go.cl" },
  });
  assert.doesNotThrow(() => assertSameOrigin(same));
  // Cookie de sesión sin Origin ni Sec-Fetch-Site: rechazar (usar Bearer en clientes no-browser).
  const blind = new Request("https://www.carga360go.cl/api/cargas", {
    method: "POST",
    headers: { cookie: "c360_session=token-de-sesion", host: "www.carga360go.cl" },
  });
  assert.throws(() => assertSameOrigin(blind), /Origen/);
  const blindOk = new Request("https://www.carga360go.cl/api/cargas", {
    method: "POST",
    headers: { cookie: "c360_session=token-de-sesion", "sec-fetch-site": "same-origin", host: "www.carga360go.cl" },
  });
  assert.doesNotThrow(() => assertSameOrigin(blindOk));
  assert.throws(() => resetPassword("token-falso", "123"), AppError);
});

test("documentos: solo PDF/JPG/PNG reales", () => {
  const carrier = user("transportista", "docs");
  const fake = { buffer: Buffer.from("no soy un pdf"), originalName: "x.pdf", mime: "application/pdf" };
  assert.throws(() => addDocument(carrier, { type: "cedula", expiry: addDays(300), holderName: "Ana", file: fake }), /dañado/);
  const webp = { buffer: Buffer.from("RIFF0000WEBP"), originalName: "x.webp", mime: "image/webp" };
  assert.throws(() => addDocument(carrier, { type: "cedula", expiry: addDays(300), holderName: "Ana", file: webp }), /PDF, JPG o PNG/);
  const pdf = { buffer: Buffer.from("%PDF-1.4\n%%EOF"), originalName: "cedula.pdf", mime: "application/pdf" };
  const doc = addDocument(carrier, { type: "cedula", expiry: addDays(300), holderName: "Ana", file: pdf });
  assert.equal(doc.mime, "application/pdf");
  assert.throws(() => addDocument(carrier, { type: "padron", expiry: addDays(300), holderName: "ZZ" }), /patente/);
});

test("fase 1: ofertas de transportistas aprobados, mejora, elección y cierre", async () => {
  const owner = user("mandante", "mandante1");
  const good = user("transportista", "bueno");
  const cheap = user("transportista", "barato");
  const pending = user("transportista", "pendiente", false);

  assert.equal(getSettings().offerHours, 24);
  assert.equal(getSettings().allowImprove, true);
  assert.equal(getSettings().showSuggestedPrice, false);

  const l = load(owner, { budgetClp: 900000 });
  assert.equal(l.status, "abierta");
  const hours = (Date.parse(l.offersUntil || "") - Date.now()) / 3600_000;
  assert.ok(hours > 23.9 && hours <= 24, `plazo por defecto 24 h, fue ${hours}`);

  assert.equal(canOffer(pending), false);
  await assert.rejects(submitOffer(pending, l.id, { priceClp: 800000, pickupDate: addDays(3) }, { notify: false }), /aprobada/);
  await assert.rejects(submitOffer(owner, l.id, { priceClp: 800000, pickupDate: addDays(3) }, { notify: false }), /transportistas/);
  await assert.rejects(submitOffer(good, l.id, { priceClp: 0, pickupDate: addDays(3) }, { notify: false }), AppError);
  await assert.rejects(submitOffer(good, l.id, { priceClp: 800000, pickupDate: addDays(-1) }, { notify: false }), /anterior/);

  const first = await submitOffer(good, l.id, { priceClp: 850000, pickupDate: addDays(3), note: "Incluye descarga" }, { notify: false });
  assert.equal(first.improved, false);
  await assert.rejects(submitOffer(good, l.id, { priceClp: 900000, pickupDate: addDays(3) }, { notify: false }), /igual o menor/);
  const better = await submitOffer(good, l.id, { priceClp: 820000, pickupDate: addDays(4) }, { notify: false });
  assert.equal(better.improved, true);
  assert.equal(better.offer.revisions, 1);
  await submitOffer(cheap, l.id, { priceClp: 780000, pickupDate: addDays(3) }, { notify: false });

  // El transportista solo ve su oferta; el mandante ve todas, sin contacto hasta elegir.
  assert.equal(offersVisibleTo(l.id, good).length, 1);
  const ownerView = offersVisibleTo(l.id, owner);
  assert.equal(ownerView.length, 2);
  assert.equal(ownerView[0].priceClp, 780000);
  assert.equal(ownerView[0].carrierWhatsapp, "");
  assert.equal(getLoad(l.id)?.offerCount, 2);

  await assert.rejects(acceptOffer(good, first.offer.id, { notify: false }), /Solo quien publicó/);
  await acceptOffer(owner, first.offer.id, { notify: false });
  const after = listOffersForLoad(l.id);
  assert.equal(after.find((o) => o.carrierId === good.id)?.status, "aceptada");
  assert.equal(after.find((o) => o.carrierId === cheap.id)?.status, "rechazada");
  assert.equal(getLoad(l.id)?.status, "adjudicada");
  assert.ok(!listLoads().some((item) => item.id === l.id), "las adjudicadas salen del listado público");
  assert.ok(offersVisibleTo(l.id, owner).find((o) => o.status === "aceptada")?.carrierWhatsapp);
  await assert.rejects(submitOffer(cheap, l.id, { priceClp: 700000, pickupDate: addDays(3) }, { notify: false }), /adjudicada/);
  assert.ok(listAudit().some((entry) => entry.action === "oferta.aceptada" && entry.targetId === l.id));
});

test("fase 1: valores por carga sobrescriben los del administrador", async () => {
  const owner = user("mandante", "mandante2");
  const carrier = user("transportista", "carrier2");
  saveSettings({ offerHours: 48, allowImprove: true });
  const strict = load(owner, { offerHours: 6, allowImprove: false });
  const hours = (Date.parse(strict.offersUntil || "") - Date.now()) / 3600_000;
  assert.ok(hours > 5.9 && hours <= 6);
  assert.equal(strict.allowImprove, false);
  await submitOffer(carrier, strict.id, { priceClp: 500000, pickupDate: addDays(3) }, { notify: false });
  await assert.rejects(submitOffer(carrier, strict.id, { priceClp: 450000, pickupDate: addDays(3) }, { notify: false }), /no se pueden modificar/);

  const byDefault = load(owner);
  const h2 = (Date.parse(byDefault.offersUntil || "") - Date.now()) / 3600_000;
  assert.ok(h2 > 47.9 && h2 <= 48, "usa el plazo del administrador");

  // Plazo vencido: no se aceptan ofertas nuevas.
  getDb().prepare(`UPDATE loads SET offers_until = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), byDefault.id);
  await assert.rejects(submitOffer(carrier, byDefault.id, { priceClp: 500000, pickupDate: addDays(3) }, { notify: false }), /plazo/);
  // Editar con un plazo nuevo reabre.
  updateLoad(owner, byDefault.id, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(3),
    equipment: "rampla_plana",
    description: "Pallets de prueba",
    weightT: 10,
    specs: {},
    offerHours: 12,
  });
  const reopened = await submitOffer(carrier, byDefault.id, { priceClp: 500000, pickupDate: addDays(3) }, { notify: false });
  withdrawOffer(carrier, reopened.offer.id);
  closeLoad(owner, byDefault.id);
  assert.equal(getLoad(byDefault.id)?.status, "cerrada");
  assert.throws(() => saveSettings({ offerHours: 0 }), AppError);
  saveSettings({ offerHours: 24 });
  assert.throws(() => load(owner, { budgetClp: -1 }), AppError);
  assert.throws(() => load(owner, { pickupDate: addDays(400) }), /un año/);
});
