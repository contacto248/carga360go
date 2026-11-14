import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { POST as postCarga } from "../src/app/api/cargas/route";
import { assertCanPublish } from "../src/lib/access";
import { acceptPrivacyFor, approveCarrier, setRequirement } from "../src/lib/accreditation";
import { createSession, registerUser, upsertAdmin, userFromToken } from "../src/lib/auth";
import { backupContactOf, needsBackupContact, parseBackupContact, setBackupContact, verificationPending } from "../src/lib/backup-contact";
import { isCarrierLocked, markContactVerified, rejectCarrier } from "../src/lib/carrier";
import { getDb } from "../src/lib/db";
import { addDocument, setDocumentVerification } from "../src/lib/documents";
import { AppError } from "../src/lib/errors";
import { rutDv, todayChile } from "../src/lib/format";
import { createLoad, createTruck } from "../src/lib/listings";
import {
  accountStateOf,
  assertNotManualReadonly,
  expireManualReadonly,
  grantManualReadonly,
  isManualReadonly,
  MANUAL_READONLY_DAYS,
  manualReadonlyOf,
  readonlyActive,
  revokeManualReadonly,
} from "../src/lib/manual-readonly";
import { buildReminderEmail } from "../src/lib/onboarding/messages";
import { onboardingStatusOf } from "../src/lib/onboarding/status";
import { assertCanOffer, submitOffer } from "../src/lib/offers";
import { resetRateLimits } from "../src/lib/rate-limit";
import { BACKUP_CONTACT_ASK, ruleReply } from "../src/lib/whatsapp/intents";
import type { PublicUser } from "../src/lib/types";

let seq = 30_000_000;
function nextRut(): string {
  seq += 1;
  return `${seq}-${rutDv(String(seq))}`;
}

function fresh(id: string): PublicUser {
  const row = getDb().prepare(`SELECT id FROM users WHERE id = ?`).get(id) as { id: string };
  const token = createSession(row.id);
  const user = userFromToken(token);
  assert.ok(user);
  return user;
}

function newUser(role: "transportista" | "mandante", tag: string, extra: { backupContact?: string; requireBackupContact?: boolean } = {}) {
  const n = String(seq % 100_000_000).padStart(8, "0").slice(-8);
  return registerUser({
    role,
    razonSocial: `Respaldo ${tag} SpA`,
    rut: nextRut(),
    contactName: "Prueba",
    email: `${tag}@respaldo.test.cl`,
    password: "clave-segura-respaldo-1",
    whatsapp: `+56 9 ${n.slice(0, 4)} ${n.slice(4)}`,
    city: "Antofagasta",
    ...extra,
  }).user;
}

const admin = () =>
  upsertAdmin({
    email: "admin-respaldo@test.cl",
    password: "Admin-Clave-Larga-2026",
    razonSocial: "Admin Respaldo",
    rut: "11.111.111-1",
    contactName: "Admin",
    whatsapp: "+56 9 1000 0009",
    city: "Santiago",
  });

const isCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

function expectStatus(error: unknown, status: number) {
  return error instanceof AppError && error.status === status;
}

/** Deja la cuenta 100% acreditada salvo la aprobación final. */
function completeAccreditation(user: PublicUser) {
  markContactVerified(user.id, "email", true);
  markContactVerified(user.id, "phone", true);
  acceptPrivacyFor(user.id);
  for (const key of ["calidad", "seguridad", "medioambiente"]) setRequirement(user.id, key, "cumple");
  if (user.role === "transportista") {
    for (const type of ["cedula", "licencia"]) {
      setDocumentVerification(addDocument(user, { type, expiry: "2099-01-01", holderName: "Prueba", detail: type === "licencia" ? "A5" : null }).id, "verificado", null);
    }
    for (const type of ["padron", "revision", "soap", "permiso"]) {
      setDocumentVerification(addDocument(user, { type, expiry: "2099-01-01", holderName: "abcd-12" }).id, "verificado", null);
    }
  }
}

// ---------- 1) Contacto de respaldo ----------

test("respaldo: valida teléfono chileno (celular o fijo) o correo, distinto del principal", () => {
  const primary = { email: "Principal@Test.cl", whatsapp: "56911112222" };
  assert.deepEqual(parseBackupContact("+56 9 3333 4444", primary), { value: "56933334444", type: "telefono" });
  assert.deepEqual(parseBackupContact("933334444", primary), { value: "56933334444", type: "telefono" });
  assert.deepEqual(parseBackupContact("+56 2 2345 6789", primary), { value: "56223456789", type: "telefono" });
  assert.deepEqual(parseBackupContact(" Otro@Correo.CL ", primary), { value: "otro@correo.cl", type: "email" });
  assert.throws(() => parseBackupContact("", primary), isCode("respaldo_requerido"));
  assert.throws(() => parseBackupContact("12345", primary), isCode("respaldo_invalido"));
  assert.throws(() => parseBackupContact("+54 9 11 2345 6789", primary), isCode("respaldo_invalido"));
  assert.throws(() => parseBackupContact("correo@malo", primary), isCode("respaldo_invalido"));
  assert.throws(() => parseBackupContact("principal@test.cl", primary), isCode("respaldo_igual"));
  assert.throws(() => parseBackupContact("+56 9 1111 2222", primary), isCode("respaldo_igual"));
});

test("respaldo: el registro web lo exige y lo guarda; la app lo deja opcional y se pide después", () => {
  assert.throws(() => newUser("mandante", "sin-respaldo-web", { requireBackupContact: true }), isCode("respaldo_requerido"));
  const web = newUser("transportista", "con-respaldo-web", { backupContact: "respaldo.web@otro.cl", requireBackupContact: true });
  assert.deepEqual(
    { value: backupContactOf(web.id)?.value, type: backupContactOf(web.id)?.type },
    { value: "respaldo.web@otro.cl", type: "email" },
  );
  assert.equal(needsBackupContact(web.id), false);

  const app = newUser("transportista", "app-sin-respaldo");
  assert.equal(backupContactOf(app.id), null);
  assert.equal(verificationPending(app.id), true);
  assert.equal(needsBackupContact(app.id), true);
  // Correos de recordatorio y bot piden el respaldo mientras falte.
  const status = onboardingStatusOf(app.id);
  assert.ok(status?.backupContactMissing);
  assert.match(buildReminderEmail(status!, "24h").text, /respaldo/);
  setBackupContact(app.id, "+56 2 2345 6789");
  assert.equal(needsBackupContact(app.id), false);
  assert.equal(backupContactOf(app.id)?.display, "+56 2 2345 6789");
  assert.equal(onboardingStatusOf(app.id)?.backupContactMissing, false);
});

test("respaldo: el bot de WhatsApp/web lo pide al consultar estado de cuenta o registro", () => {
  const live = { activeLoads: 0, activeTrucks: 0, recentLoads: [], recentTrucks: [] } as unknown as Parameters<typeof ruleReply>[1];
  assert.ok(ruleReply("estado_cuenta", live).includes(BACKUP_CONTACT_ASK));
  assert.ok(ruleReply("registro_transportista", live, "web").includes(BACKUP_CONTACT_ASK));
});

// ---------- 2) Verificación manual: solo lectura 30 días ----------

test("solo lectura: transportista pendiente ve la plataforma pero no publica, oferta ni toma cargas", async () => {
  const root = admin();
  const carrier = newUser("transportista", "ro-carrier", { backupContact: "+56 9 7777 6666" });
  assert.equal(isCarrierLocked(carrier), true);
  assert.equal(accountStateOf(carrier), "pendiente");

  const before = Date.now();
  const until = grantManualReadonly(root, carrier.id);
  const days = (Date.parse(until) - before) / 86_400_000;
  assert.ok(days > MANUAL_READONLY_DAYS - 0.01 && days <= MANUAL_READONLY_DAYS + 0.01, `vence en ${days} días`);

  const user = fresh(carrier.id);
  assert.equal(user.manualReadonlyUntil, until);
  assert.equal(isManualReadonly(user), true);
  assert.equal(accountStateOf(user), "manual_readonly");
  assert.equal(isCarrierLocked(user), false, "puede ver el marketplace");
  const ro = manualReadonlyOf(user.id);
  assert.equal(ro.grantedBy, root.id);
  assert.equal(ro.grantedByEmail, root.email);
  assert.ok(ro.grantedAt);
  assert.equal(ro.daysLeft, MANUAL_READONLY_DAYS);

  // Bloqueos de servidor aunque complete el correo (la cuenta sigue sin aprobar).
  markContactVerified(user.id, "email", true);
  const u2 = fresh(user.id);
  assert.throws(() => assertCanPublish(u2), isCode("solo_lectura"));
  assert.throws(() => assertCanOffer(u2), isCode("solo_lectura"));
  assert.throws(() => createTruck(u2, {} as never), isCode("solo_lectura"));
  await assert.rejects(() => submitOffer(u2, "no-existe", { priceClp: 100000, pickupDate: todayChile() }), isCode("solo_lectura"));

  // Revocar: vuelve a quedar bloqueado.
  assert.equal(revokeManualReadonly(root, user.id), true);
  assert.equal(isCarrierLocked(fresh(user.id)), true);
  assert.equal(fresh(user.id).manualReadonlyUntil, null);
});

test("solo lectura: solo un administrador la otorga o revoca, y no a cuentas ya verificadas", () => {
  const root = admin();
  const carrier = newUser("transportista", "ro-permisos", { backupContact: "otro.permisos@correo.cl" });
  const other = newUser("mandante", "ro-no-admin", { backupContact: "+56 9 5555 4444" });
  assert.throws(() => grantManualReadonly(other, carrier.id), (e: unknown) => expectStatus(e, 403));
  assert.throws(() => revokeManualReadonly(other, carrier.id), (e: unknown) => expectStatus(e, 403));
  assert.throws(() => grantManualReadonly(root, root.id), AppError);
  assert.throws(() => grantManualReadonly(root, "no-existe"), (e: unknown) => expectStatus(e, 404));
  completeAccreditation(carrier);
  approveCarrier(root.id, carrier.id);
  assert.throws(() => grantManualReadonly(root, carrier.id), /ya está verificada/);
});

test("solo lectura: al vencer los 30 días vuelve a pendiente y pierde el acceso", () => {
  const root = admin();
  const carrier = newUser("transportista", "ro-vence", { backupContact: "+56 9 4444 3333" });
  grantManualReadonly(root, carrier.id);
  const row = getDb().prepare(`SELECT role, verification_status, manual_readonly_until FROM users WHERE id = ?`).get(carrier.id) as {
    role: string;
    verification_status: string;
    manual_readonly_until: string;
  };
  // Regla pura: un día después del vencimiento ya no rige.
  assert.equal(readonlyActive(row, new Date(Date.parse(row.manual_readonly_until) + 86_400_000)), false);
  assert.equal(readonlyActive(row, new Date(Date.parse(row.manual_readonly_until) - 60_000)), true);
  // Simula el vencimiento en la base.
  getDb().prepare(`UPDATE users SET manual_readonly_until = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), carrier.id);
  const user = fresh(carrier.id);
  assert.equal(user.manualReadonlyUntil, null);
  assert.equal(isCarrierLocked(user), true);
  assert.equal(accountStateOf(user), "pendiente");
  assert.equal(manualReadonlyOf(user.id).expired, true);
  assert.doesNotThrow(() => assertNotManualReadonly(user, "publicar"));
  // Limpieza del job: devuelve las cuentas vencidas y deja las columnas en NULL.
  assert.ok(expireManualReadonly().includes(carrier.id));
  assert.equal(manualReadonlyOf(carrier.id).until, null);
  assert.equal(fresh(carrier.id).verificationStatus, "pendiente");
});

test("solo lectura: la verificación completa y el rechazo la reemplazan", () => {
  const root = admin();
  const carrier = newUser("transportista", "ro-aprobado", { backupContact: "+56 9 2222 1111" });
  grantManualReadonly(root, carrier.id);
  completeAccreditation(carrier);
  approveCarrier(root.id, carrier.id);
  const approved = fresh(carrier.id);
  assert.equal(approved.verificationStatus, "verificado");
  assert.equal(manualReadonlyOf(carrier.id).until, null);
  assert.equal(accountStateOf(approved), "verificado");
  assert.doesNotThrow(() => assertCanOffer(approved));
  assert.equal(verificationPending(carrier.id), false);

  const other = newUser("transportista", "ro-rechazado", { backupContact: "+56 9 2222 3333" });
  grantManualReadonly(root, other.id);
  rejectCarrier(root.id, other.id, "Documentos ilegibles");
  assert.equal(manualReadonlyOf(other.id).until, null);
  assert.equal(isCarrierLocked(fresh(other.id)), true);
  // Una cuenta rechazada puede recibir la verificación manual: vuelve a pendiente con solo lectura.
  grantManualReadonly(root, other.id);
  assert.equal(fresh(other.id).verificationStatus, "pendiente");
  assert.equal(accountStateOf(fresh(other.id)), "manual_readonly");
});

test("solo lectura: POST /api/cargas responde 403 solo_lectura a un mandante en verificación manual", async () => {
  resetRateLimits();
  const root = admin();
  const shipper = newUser("mandante", "ro-mandante", { backupContact: "+56 9 8888 1111" });
  markContactVerified(shipper.id, "email", true);
  grantManualReadonly(root, shipper.id);
  assert.throws(() => createLoad(fresh(shipper.id), {} as never), isCode("solo_lectura"));
  const token = createSession(shipper.id);
  const response = await postCarga(
    new Request("http://127.0.0.1:4317/api/cargas", {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        "x-real-ip": "203.0.113.77",
        "sec-fetch-site": "same-origin",
        host: "127.0.0.1:4317",
        cookie: `c360_session=${token}`,
      }),
      body: JSON.stringify({ origin: "Antofagasta", destination: "Calama", pickupDate: todayChile(), equipment: "rampla_plana", weightT: 10, description: "x" }),
    }),
    { params: Promise.resolve({}) },
  );
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code?: string; error?: string };
  assert.equal(body.code, "solo_lectura");
  assert.match(body.error ?? "", /solo lectura/);
});
