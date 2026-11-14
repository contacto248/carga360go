import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { POST } from "../src/app/api/cargas/route";
import { createSession, upsertAdmin } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { todayChile } from "../src/lib/format";
import { resetRateLimits } from "../src/lib/rate-limit";

const BASE = "http://127.0.0.1:4317";
const ctx = { params: Promise.resolve({}) };

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function countPublicada(actorId: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'carga.publicada' AND actor_id = ?`)
    .get(actorId) as { n: number };
  return row.n;
}

function publishRequest(token: string | null, body: unknown, ip = "203.0.113.50") {
  const headers = new Headers({
    "content-type": "application/json",
    "x-real-ip": ip,
    "sec-fetch-site": "same-origin",
    host: "127.0.0.1:4317",
  });
  if (token) headers.set("cookie", `c360_session=${token}`);
  return new Request(`${BASE}/api/cargas`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

test("publicar carga con éxito registra exactamente un evento carga.publicada", async () => {
  resetRateLimits();
  const admin = upsertAdmin({
    email: "audit-carga-ok@test.cl",
    password: "Admin-Clave-Larga-2026",
    razonSocial: "Admin Audit",
    rut: "11.111.111-1",
    contactName: "Admin",
    whatsapp: "+56 9 1000 0001",
    city: "Santiago",
  });
  const token = createSession(admin.id, { mfa: true });
  const before = countPublicada(admin.id);
  const pickup = addDays(todayChile(), 3);
  const response = await POST(
    publishRequest(token, {
      origin: "Santiago",
      destination: "Antofagasta",
      pickupDate: pickup,
      equipment: "rampla_plana",
      description: "Carga de auditoría",
      weightT: 12,
      specs: {},
    }),
    ctx,
  );
  assert.equal(response.status, 201, await response.clone().text());
  const payload = (await response.json()) as { load: { id: string; equipment: string } };
  assert.equal(countPublicada(admin.id), before + 1);
  const entry = getDb()
    .prepare(`SELECT action, target_type, target_id, detail, ip FROM audit_log WHERE action = 'carga.publicada' AND target_id = ?`)
    .get(payload.load.id) as { action: string; target_type: string; target_id: string; detail: string; ip: string };
  assert.equal(entry.target_type, "carga");
  assert.equal(entry.target_id, payload.load.id);
  assert.equal(entry.ip, "203.0.113.50");
  const detail = JSON.parse(entry.detail) as Record<string, unknown>;
  assert.deepEqual(Object.keys(detail).sort(), ["equipment"]);
  assert.equal(detail.equipment, "rampla_plana");
  assert.equal("email" in detail || "whatsapp" in detail || "rut" in detail || "contactName" in detail, false);
});

test("fallo de validación no registra evento carga.publicada", async () => {
  resetRateLimits();
  const admin = upsertAdmin({
    email: "audit-carga-fail@test.cl",
    password: "Admin-Clave-Larga-2026",
    razonSocial: "Admin Audit Fail",
    rut: "22.222.222-2",
    contactName: "Admin",
    whatsapp: "+56 9 1000 0002",
    city: "Santiago",
  });
  const token = createSession(admin.id, { mfa: true });
  const before = countPublicada(admin.id);
  const loadsBefore = (getDb().prepare(`SELECT COUNT(*) AS n FROM loads WHERE owner_id = ?`).get(admin.id) as { n: number }).n;
  const pickup = addDays(todayChile(), 3);
  const response = await POST(
    publishRequest(token, {
      origin: "Santiago",
      destination: "Santiago",
      pickupDate: pickup,
      equipment: "rampla_plana",
      description: "Debe fallar",
      weightT: 12,
      specs: {},
    }),
    ctx,
  );
  assert.equal(response.status, 400, await response.clone().text());
  assert.equal(countPublicada(admin.id), before);
  const loadsAfter = (getDb().prepare(`SELECT COUNT(*) AS n FROM loads WHERE owner_id = ?`).get(admin.id) as { n: number }).n;
  assert.equal(loadsAfter, loadsBefore);
});

test("fallo real de persistencia no deja carga ni evento carga.publicada", async () => {
  resetRateLimits();
  const admin = upsertAdmin({
    email: "audit-carga-persist@test.cl",
    password: "Admin-Clave-Larga-2026",
    razonSocial: "Admin Persist Fail",
    rut: "33.333.333-3",
    contactName: "Admin",
    whatsapp: "+56 9 1000 0003",
    city: "Santiago",
  });
  const token = createSession(admin.id, { mfa: true });
  const before = countPublicada(admin.id);
  const loadsBefore = (getDb().prepare(`SELECT COUNT(*) AS n FROM loads WHERE owner_id = ?`).get(admin.id) as { n: number }).n;
  getDb().exec(`
    CREATE TRIGGER IF NOT EXISTS trg_block_load_insert
    BEFORE INSERT ON loads
    BEGIN
      SELECT RAISE(ABORT, 'simulated persistence failure');
    END;
  `);
  try {
    const pickup = addDays(todayChile(), 4);
    const response = await POST(
      publishRequest(token, {
        origin: "Santiago",
        destination: "Valparaíso",
        pickupDate: pickup,
        equipment: "rampla_plana",
        description: "Fallo de inserción",
        weightT: 10,
        specs: {},
      }),
      ctx,
    );
    assert.equal(response.status, 500, await response.clone().text());
    assert.equal(countPublicada(admin.id), before);
    const loadsAfter = (getDb().prepare(`SELECT COUNT(*) AS n FROM loads WHERE owner_id = ?`).get(admin.id) as { n: number }).n;
    assert.equal(loadsAfter, loadsBefore);
  } finally {
    getDb().exec(`DROP TRIGGER IF EXISTS trg_block_load_insert`);
  }
});

test("si falla el audit tras guardar, se revierte la carga y no hay evento", async () => {
  resetRateLimits();
  const admin = upsertAdmin({
    email: "audit-carga-rollback@test.cl",
    password: "Admin-Clave-Larga-2026",
    razonSocial: "Admin Audit Rollback",
    rut: "44.444.444-4",
    contactName: "Admin",
    whatsapp: "+56 9 1000 0004",
    city: "Santiago",
  });
  const token = createSession(admin.id, { mfa: true });
  const before = countPublicada(admin.id);
  const loadsBefore = (getDb().prepare(`SELECT COUNT(*) AS n FROM loads WHERE owner_id = ?`).get(admin.id) as { n: number }).n;
  getDb().exec(`
    CREATE TRIGGER IF NOT EXISTS trg_block_audit_publicada
    BEFORE INSERT ON audit_log
    WHEN NEW.action = 'carga.publicada'
    BEGIN
      SELECT RAISE(ABORT, 'simulated audit failure');
    END;
  `);
  try {
    const pickup = addDays(todayChile(), 5);
    const response = await POST(
      publishRequest(token, {
        origin: "Santiago",
        destination: "La Serena",
        pickupDate: pickup,
        equipment: "rampla_plana",
        description: "Fallo de auditoría",
        weightT: 8,
        specs: {},
      }),
      ctx,
    );
    assert.equal(response.status, 500, await response.clone().text());
    assert.equal(countPublicada(admin.id), before);
    const loadsAfter = (getDb().prepare(`SELECT COUNT(*) AS n FROM loads WHERE owner_id = ?`).get(admin.id) as { n: number }).n;
    assert.equal(loadsAfter, loadsBefore, "sin éxito engañoso ni carga huérfana al reintentar");
  } finally {
    getDb().exec(`DROP TRIGGER IF EXISTS trg_block_audit_publicada`);
  }
});
