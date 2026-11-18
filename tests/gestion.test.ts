import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { GET } from "../src/app/api/admin/gestion/route";
import { GestionBoard } from "../src/components/GestionBoard";
import { saveSearch } from "../src/lib/alerts";
import { createAgentLead, upsertAgentConversation } from "../src/lib/agent/store";
import { createSession, registerUser, setUserVerification, upsertAdmin } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { rutDv, todayChile } from "../src/lib/format";
import { gestionSnapshot } from "../src/lib/gestion/metrics";
import { SIN_DATOS } from "../src/lib/gestion/types";
import { createLoad, createTruck } from "../src/lib/listings";
import { privacyVersion } from "../src/lib/privacy";
import type { PublicUser } from "../src/lib/types";

const ctx = { params: Promise.resolve({}) };

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

let seq = 0;
function account(role: "transportista" | "mandante", city: string): PublicUser {
  seq += 1;
  const body = String(16_000_000 + seq * 7919);
  const rut = `${body}-${rutDv(body)}`;
  return registerUser({
    role,
    razonSocial: `Gestion ${role} ${seq}`,
    rut,
    contactName: `Persona ${seq}`,
    email: `gestion${seq}@gestion.test`,
    password: "clave-segura-1",
    whatsapp: `+56 9 ${String(40000000 + seq).slice(0, 4)} ${String(40000000 + seq).slice(4)}`,
    city,
  }).user;
}

test("tablero vacío, con datos reales y protegido", async () => {
  const empty = gestionSnapshot();
  assert.equal(empty.cargasTotal, 0);
  assert.equal(empty.leadsTotal, 0);
  assert.equal(empty.retornos, 0);
  assert.equal(empty.alertasOps, 0);
  const emptyHtml = renderToStaticMarkup(createElement(GestionBoard, { snap: empty }));
  assert.ok(emptyHtml.includes(SIN_DATOS));
  assert.doesNotMatch(emptyHtml, /\$\s?\d|\bCLP\b|30 días gratis/);

  const today = todayChile();
  const mandante = account("mandante", "Santiago");
  const carrier = account("transportista", "Arica");
  setUserVerification(carrier.id, "verificado", null);
  createTruck(carrier, {
    origin: "Santiago",
    destination: "Concepción",
    availableFrom: today,
    availableTo: addDays(today, 10),
    equipment: "rampla_plana",
    tonnage: 28,
    specs: {},
  });
  createTruck(carrier, {
    origin: "Arica",
    destination: "Punta Arenas",
    availableFrom: today,
    availableTo: addDays(today, 20),
    equipment: "rampla_plana",
    tonnage: 30,
    specs: {},
  });
  const compatible = createLoad(mandante, {
    origin: "Santiago",
    destination: "Concepción",
    pickupDate: addDays(today, 1),
    equipment: "rampla_plana",
    description: "Carga de prueba",
    weightT: 20,
    specs: {},
  });
  createLoad(mandante, {
    origin: "Punta Arenas",
    destination: "Arica",
    pickupDate: addDays(today, 2),
    equipment: "rampla_plana",
    description: "Vuelta de prueba",
    weightT: 18,
    specs: {},
  });
  getDb().prepare(`UPDATE loads SET status = 'adjudicada', trip_status = 'en_transito' WHERE id = ?`).run(compatible.id);
  const at = new Date().toISOString();
  const conv = upsertAgentConversation({ channel: "web", sessionKey: randomUUID() }, at);
  createAgentLead({
    conversationId: conv.id,
    channel: "web",
    kind: "cotizacion",
    name: "Eva Lagos",
    contact: "eva.gestion@ejemplo.cl",
    contactType: "email",
    backupContact: "56955556666",
    backupContactType: "telefono",
    data: { consentimiento: "si", privacy_version: privacyVersion(), consent_at: at, origen: "Copiapó", destino: "Caldera" },
    summary: "Solicitud de prueba",
    at,
  });
  saveSearch(mandante, "cargas", { origen: "Santiago" });
  getDb()
    .prepare(`INSERT INTO alert_log (id, user_id, listing_kind, listing_id, reason, delivery, sent_at) VALUES (?, ?, 'carga', ?, 'prueba', 'omitido', ?)`)
    .run(randomUUID(), mandante.id, compatible.id, new Date().toISOString());

  const snap = gestionSnapshot();
  assert.equal(snap.cargasTotal, 2);
  assert.equal(snap.cargasPorEstado.find((row) => row.estado === "abierta")?.n, 1);
  assert.equal(snap.cargasPorEstado.find((row) => row.estado === "adjudicada")?.n, 1);
  assert.equal(snap.viajesTotal, 1);
  assert.equal(snap.transportistasActivos, 1);
  assert.equal(snap.camionesActivos, 2);
  assert.equal(snap.leadsTotal, 1);
  assert.equal(snap.retornos, 1);
  assert.equal(snap.compatibles, 1);
  assert.equal(snap.retornoMuestras[0]?.route, "Punta Arenas → Arica");
  assert.equal(snap.alertasEnviadas, 1);
  assert.equal(snap.alertasGuardadas, 1);
  const html = renderToStaticMarkup(createElement(GestionBoard, { snap }));
  assert.match(html, /Punta Arenas → Arica/);
  assert.doesNotMatch(html, /\$\s?\d|30 días gratis/);

  const anon = await GET(new Request("http://127.0.0.1:4317/api/admin/gestion"), ctx);
  assert.equal(anon.status, 401);
  const mandanteToken = createSession(mandante.id);
  const forbidden = await GET(new Request("http://127.0.0.1:4317/api/admin/gestion", { headers: { authorization: `Bearer ${mandanteToken}` } }), ctx);
  assert.equal(forbidden.status, 403);
  const admin = upsertAdmin({
    email: "admin.gestion@gestion.test",
    password: "Admin-Clave-Larga-2026",
    razonSocial: "Admin",
    rut: "78.553.352-6",
    contactName: "Administrador",
    whatsapp: "+56 9 5842 8693",
    city: "Santiago",
  });
  const adminToken = createSession(admin.id, { mfa: true });
  const ok = await GET(new Request("http://127.0.0.1:4317/api/admin/gestion", { headers: { authorization: `Bearer ${adminToken}` } }), ctx);
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { gestion: { cargasTotal: number; leadsTotal: number; retornos: number } };
  assert.equal(body.gestion.cargasTotal, 2);
  assert.equal(body.gestion.leadsTotal, 1);
  assert.equal(body.gestion.retornos, 1);
});

