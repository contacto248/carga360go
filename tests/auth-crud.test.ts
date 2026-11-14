import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
import { getDb } from "../src/lib/db";
import { todayChile } from "../src/lib/format";
import type { PublicUser } from "../src/lib/types";
import {
  hashPassword,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  revokeToken,
  setUserVerification,
  tokenHash,
  upsertAdmin,
  userFromToken,
  verifyPassword,
} from "../src/lib/auth";
import { addDocument } from "../src/lib/documents";
import { AppError } from "../src/lib/errors";
import { createLoad, createTruck, deleteLoad, getLoad, listLoads, updateLoad } from "../src/lib/listings";

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function account(role: "transportista" | "mandante", suffix: string) {
  return registerUser({
    role,
    razonSocial: `Empresa ${suffix}`,
    rut: suffix === "t" ? "12.345.678-5" : "7.654.321-6",
    contactName: "Contacto",
    email: `${suffix}@carga360go.test`,
    password: "clave-segura-1",
    whatsapp: suffix === "t" ? "+56 9 1111 1111" : "+56 9 2222 2222",
    city: "Antofagasta",
  });
}

test("autenticación, roles y CRUD de cargas y camiones", async () => {
  assert.notEqual(hashPassword("clave-segura-1"), "clave-segura-1");
  assert.equal(verifyPassword("clave-segura-1", hashPassword("clave-segura-1")), true);
  assert.equal(verifyPassword("otra", hashPassword("clave-segura-1")), false);

  assert.throws(
    () =>
      registerUser({
        role: "mandante",
        razonSocial: "RUT malo",
        rut: "12.345.678-9",
        contactName: "Contacto",
        email: "malo@carga360go.test",
        password: "clave-segura-1",
        whatsapp: "+56 9 4444 4444",
        city: "Calama",
      }),
    (error: unknown) => error instanceof AppError && /RUT/.test(error.message),
  );

  const mandante = account("mandante", "m");
  const transportista = account("transportista", "t");
  const stored = getDb().prepare(`SELECT password_hash FROM users WHERE email = ?`).get("m@carga360go.test") as {
    password_hash: string;
  };
  assert.ok(stored.password_hash.startsWith("scrypt$"));
  assert.equal(stored.password_hash.includes("clave-segura-1"), false);

  assert.throws(() => account("mandante", "m"), (error: unknown) => error instanceof AppError && error.status === 409);
  assert.throws(() => loginUser("m@carga360go.test", "incorrecta"), (error: unknown) => error instanceof AppError && error.status === 401);

  const session = loginUser("m@carga360go.test", "clave-segura-1");
  assert.equal(userFromToken(session.token)?.email, "m@carga360go.test");
  const sessionRows = getDb().prepare(`SELECT token_hash FROM sessions WHERE user_id = ?`).all(mandante.user.id) as {
    token_hash: string;
  }[];
  assert.ok(sessionRows.some((row) => row.token_hash === tokenHash(session.token)));
  assert.ok(sessionRows.every((row) => row.token_hash !== session.token));
  revokeToken(session.token);
  assert.equal(userFromToken(session.token), null);

  const today = todayChile();
  const pickup = addDays(today, 2);
  assert.throws(
    () =>
      createLoad(transportista.user, {
        origin: "Calama",
        destination: "Antofagasta",
        pickupDate: pickup,
        equipment: "rampla_plana",
        description: "Fierro",
        weightT: 20,
        specs: {},
      }),
    (error: unknown) => error instanceof AppError && error.status === 403,
  );

  const load = createLoad(mandante.user, {
    origin: "Calama",
    destination: "Antofagasta",
    pickupDate: pickup,
    equipment: "cama_baja",
    description: "Excavadora para taller",
    weightT: 30,
    specs: { largoM: 10, anchoM: 3, requiereAcreditacion: true, requiereRampas: true },
    budgetClp: 1500000,
    notes: "Ingreso a planta",
  });
  assert.equal(getLoad(load.id)?.description, "Excavadora para taller");
  assert.equal(listLoads({ origen: "Calama" }).some((item) => item.id === load.id), true);
  assert.equal(listLoads({ origen: "Santiago" }).some((item) => item.id === load.id), false);
  assert.equal(listLoads({ regionOrigen: "antofagasta" }).some((item) => item.id === load.id), true);
  assert.equal(listLoads({ regionOrigen: "magallanes" }).some((item) => item.id === load.id), false);
  assert.equal(listLoads({ q: "excavadora" }).some((item) => item.id === load.id), true);

  const edited = updateLoad(mandante.user, load.id, {
    origin: "Calama",
    destination: "Mejillones",
    pickupDate: pickup,
    equipment: "cama_baja",
    description: "Excavadora actualizada",
    weightT: 32,
    specs: { anchoM: 3.1 },
    budgetClp: null,
    notes: null,
  });
  assert.equal(edited.destination, "Mejillones");
  assert.throws(
    () =>
      updateLoad(transportista.user, load.id, {
        origin: "Calama",
        destination: "Mejillones",
        pickupDate: pickup,
        equipment: "cama_baja",
        description: "No debe",
        weightT: 32,
        specs: {},
      }),
    (error: unknown) => error instanceof AppError && error.status === 403,
  );

  assert.throws(
    () =>
      createTruck(mandante.user, {
        origin: "Calama",
        destination: "Mejillones",
        availableFrom: today,
        availableTo: addDays(today, 4),
        equipment: "cama_baja",
        tonnage: 40,
        specs: { ejes: 4, largoM: 13, anchoM: 3.2 },
      }),
    (error: unknown) => error instanceof AppError && error.status === 403,
  );

  const fleet = createTruck(transportista.user, {
    origin: "Calama",
    destination: "Mejillones",
    availableFrom: today,
    availableTo: addDays(today, 4),
    equipment: "cama_baja",
    tonnage: 45,
    specs: { ejes: 4, largoM: 13, anchoM: 3, anchoExtM: 3.6, rampas: true },
  });
  const matched = getLoad(load.id);
  assert.ok(matched);
  assert.equal(matched.matches.length, 1);
  assert.equal(matched.matches[0]?.truck.id, fleet.id);
  assert.equal(matched.matches[0]?.score, 100);

  const admin = upsertAdmin({
    email: "admin@carga360go.test",
    password: "llave-maestra-91",
    razonSocial: "Carga360go",
    rut: "16.666.666-K",
    contactName: "Admin",
    whatsapp: "+56 9 7777 8888",
    city: "Antofagasta",
  });
  assert.equal(admin.role, "admin");
  const adminLoad = createLoad(admin, {
    origin: "Iquique",
    destination: "Santiago",
    pickupDate: pickup,
    equipment: "sider",
    description: "Pallets de repuestos",
    weightT: 12,
    specs: { pallets: 10 },
  });
  const adminTruck = createTruck(admin, {
    origin: "Iquique",
    destination: "Santiago",
    availableFrom: today,
    availableTo: addDays(today, 6),
    equipment: "sider",
    tonnage: 20,
    specs: { pallets: 20 },
  });
  assert.equal(getLoad(adminLoad.id)?.matches.some((item) => item.truck.id === adminTruck.id), false);

  deleteLoad(mandante.user, load.id);
  assert.equal(getLoad(load.id), null);

  const doc = addDocument(mandante.user, {
    type: "antecedentes",
    holderName: "Ana Soto",
    expiry: addDays(today, 10),
    file: { buffer: Buffer.from("%PDF-1.4 demo"), originalName: "antecedentes.pdf", mime: "application/pdf" },
  });
  assert.equal(doc.verificationStatus, "pendiente");
  assert.ok(doc.storedPath && fs.existsSync(path.join(process.env.UPLOAD_DIR!, doc.storedPath)));
  assert.throws(
    () =>
      addDocument(mandante.user, {
        type: "antecedentes",
        holderName: "Ana Soto",
        expiry: addDays(today, 10),
        file: { buffer: Buffer.from("MZ"), originalName: "virus.exe", mime: "application/x-msdownload" },
      }),
    (error: unknown) => error instanceof AppError,
  );
  const approved = setUserVerification(mandante.user.id, "verificado", null);
  assert.equal(approved.verificationStatus, "verificado");
  assert.throws(
    () => addDocument(transportista.user, { type: "no-existe", expiry: today }),
    (error: unknown) => error instanceof AppError,
  );

  const reset = await requestPasswordReset("t@carga360go.test");
  assert.ok(reset.devLink);
  const token = new URL(reset.devLink).searchParams.get("token");
  assert.ok(token);
  resetPassword(token, "clave-nueva-22");
  assert.throws(() => loginUser("t@carga360go.test", "clave-segura-1"), (error: unknown) => error instanceof AppError);
  const again = loginUser("t@carga360go.test", "clave-nueva-22");
  assert.equal(again.user.role, "transportista");
  assert.throws(() => resetPassword(token, "otra-clave-333"), (error: unknown) => error instanceof AppError);
  const missing = await requestPasswordReset("nadie@carga360go.test");
  assert.equal(missing.devLink, undefined);

  const victim = registerUser({
    role: "transportista",
    razonSocial: "Bloqueo",
    rut: "18.765.432-7",
    contactName: "Bloqueo",
    email: "bloqueo@carga360go.test",
    password: "clave-segura-1",
    whatsapp: "+56 9 3333 3333",
    city: "Calama",
  });
  for (let i = 0; i < 8; i += 1) {
    assert.throws(() => loginUser(victim.user.email, "mala-clave"));
  }
  assert.throws(
    () => loginUser(victim.user.email, "clave-segura-1"),
    (error: unknown) => error instanceof AppError && error.status === 429,
  );

  assert.ok(fleet.id);
  assert.equal((mandante.user as PublicUser).role, "mandante");
});
