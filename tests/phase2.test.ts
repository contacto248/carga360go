import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { test } from "node:test";
import { registerUser, setUserVerification } from "../src/lib/auth";
import { getDb, schemaV1 } from "../src/lib/db";
import { addDocument, setDocumentVerification } from "../src/lib/documents";
import { AppError } from "../src/lib/errors";
import { todayChile } from "../src/lib/format";
import { createLoad, createTruck, getLoad } from "../src/lib/listings";
import { adminMetrics } from "../src/lib/metrics";

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("migración 2, documentos por tipo y solo transportistas verificados", () => {
  const file = process.env.DATABASE_PATH ?? "";
  assert.ok(file.includes(`${path.sep}c360-`));
  if (fs.existsSync(file)) fs.rmSync(file);
  const raw = new Database(file);
  raw.exec(schemaV1);
  raw.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  raw.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)`).run(new Date().toISOString());
  raw.close();

  const db = getDb();
  const version = db.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as { v: number };
  // Migración 12: inmediata + trip_status en loads, tablas trip_events y ratings (viaje/calificación).
  // Migración 14: contacto de respaldo y verificación manual (solo lectura 30 días) en users.
  // Migración 16: motor de costos (tablas cost_*). Se comprueba por número exacto para convivir con la 15 de otra rama.
  assert.equal(version.v, 16);
  assert.ok(db.prepare(`SELECT 1 FROM schema_migrations WHERE version = 14`).get());
  assert.ok(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cost_quotes'`).get());
  const userCols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  for (const col of ["backup_contact", "backup_contact_type", "manual_readonly_until", "manual_readonly_by"]) assert.ok(userCols.includes(col), col);
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'web_chat_%' ORDER BY name`).all() as { name: string }[];
  assert.deepEqual(tables.map((t) => t.name), ["web_chat_conversations", "web_chat_messages"]);
  const loadCols = db.prepare(`PRAGMA table_info(loads)`).all() as { name: string }[];
  const docCols = db.prepare(`PRAGMA table_info(documents)`).all() as { name: string }[];
  assert.ok(loadCols.some((column) => column.name === "solo_verificados"));
  assert.ok(loadCols.some((column) => column.name === "inmediata"));
  assert.ok(loadCols.some((column) => column.name === "trip_status"));
  assert.ok(docCols.some((column) => column.name === "audience"));
  assert.ok(docCols.some((column) => column.name === "holder_name"));
  assert.ok(docCols.some((column) => column.name === "detail"));
  const schemaTables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('trip_events', 'ratings') ORDER BY name`).all() as { name: string }[];
  assert.deepEqual(schemaTables.map((t) => t.name), ["ratings", "trip_events"]);

  const today = todayChile();
  const mandante = registerUser({
    role: "mandante",
    razonSocial: "Distribuidora Norte",
    rut: "12.345.678-5",
    contactName: "Paula",
    email: "paula@fase2.test",
    password: "clave-segura-1",
    whatsapp: "+56 9 4444 4444",
    city: "Calama",
  }).user;
  const transportista = registerUser({
    role: "transportista",
    razonSocial: "Transportes Sur",
    rut: "7.654.321-6",
    contactName: "Luis",
    email: "luis@fase2.test",
    password: "clave-segura-1",
    whatsapp: "+56 9 5555 5555",
    city: "Antofagasta",
  }).user;
  const truck = createTruck(transportista, {
    origin: "Calama",
    destination: "Antofagasta",
    availableFrom: today,
    availableTo: addDays(today, 4),
    equipment: "rampla_plana",
    tonnage: 28,
    specs: { largoM: 13, anchoM: 2.5 },
  });

  assert.throws(
    () => addDocument(transportista, { type: "padron", expiry: addDays(today, 20) }),
    (error: unknown) => error instanceof AppError && /camión/.test(error.message),
  );
  const padron = addDocument(transportista, {
    type: "padron",
    expiry: addDays(today, 20),
    truckId: truck.id,
  });
  assert.equal(padron.audience, "camion");
  assert.equal(padron.verificationStatus, "pendiente");
  assert.throws(
    () => addDocument(transportista, { type: "licencia", expiry: addDays(today, 40), holderName: "Luis Pérez" }),
    (error: unknown) => error instanceof AppError && /A2/.test(error.message),
  );
  const licencia = addDocument(transportista, {
    type: "licencia",
    detail: "A5",
    holderName: "Luis Pérez",
    expiry: addDays(today, 12),
  });
  assert.equal(licencia.audience, "personal");
  assert.equal(licencia.detail, "A5");
  assert.throws(
    () => setDocumentVerification(licencia.id, "rechazado", "  "),
    (error: unknown) => error instanceof AppError && /motivo/.test(error.message),
  );
  const rejected = setDocumentVerification(licencia.id, "rechazado", "La foto no se lee");
  assert.equal(rejected.verificationStatus, "rechazado");
  assert.equal(rejected.verificationNote, "La foto no se lee");
  assert.ok(adminMetrics(today).expiring >= 1);

  const load = createLoad(mandante, {
    origin: "Calama",
    destination: "Antofagasta",
    pickupDate: addDays(today, 1),
    equipment: "rampla_plana",
    description: "Fierro para obra",
    weightT: 20,
    specs: { largoM: 12, anchoM: 2.4 },
    soloVerificados: true,
  });
  assert.equal(load.soloVerificados, true);
  assert.equal(load.matches.length, 0);
  setUserVerification(transportista.id, "verificado", null);
  // Solo el sello de cuenta no basta: sin documentos verificados al día no hay match (T-008 residual).
  assert.equal(getLoad(load.id)?.matches.length, 0);
  setDocumentVerification(padron.id, "verificado", null);
  const after = getLoad(load.id);
  assert.equal(after?.matches.length, 1);
  assert.equal(after?.matches[0]?.truck.ownerVerification, "verificado");
});
