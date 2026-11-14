import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
import { adminDeleteUser, registerUser, setUserVerification, updateProfile, upsertAdmin } from "../src/lib/auth";
import { assertCanPublish } from "../src/lib/access";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { mailOutboxDir } from "../src/lib/mail";
import { confirmEmailToken, emailTokenState, resendEmailVerification, startEmailVerification } from "../src/lib/verification";

function outboxFor(email: string): { file: string; body: string }[] {
  const dir = mailOutboxDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .map((name) => ({ file: name, body: fs.readFileSync(path.join(dir, name), "utf8") }))
    .filter((item) => item.body.startsWith(`To: ${email}\n`));
}

function lastToken(email: string): string {
  const mails = outboxFor(email);
  const match = /verificar-correo\?token=([A-Za-z0-9_%-]+)/.exec(mails[mails.length - 1]?.body ?? "");
  assert.ok(match, `no llegó el enlace a ${email}`);
  return decodeURIComponent(match[1]);
}

function signup(email: string, rut: string, role: "transportista" | "mandante" = "mandante") {
  return registerUser({
    role,
    razonSocial: "Empresa Verificación",
    rut,
    contactName: "Contacto",
    email,
    password: "clave-segura-1",
    whatsapp: "+56 9 3961 4605",
    city: "La Serena",
  });
}

const is409 = (code: string) => (error: unknown) => error instanceof AppError && error.status === 409 && error.code === code;

test("el correo de verificación va al registrante, dura 48 h y abrirlo (GET) no lo consume", async () => {
  const { user } = signup("amanda@empresa.test", "21.293.297-3");
  await startEmailVerification(user, { skipRate: true });
  assert.equal(outboxFor("amanda@empresa.test").length, 1);
  assert.equal(outboxFor("contacto@carga360go.cl").length, 0);
  const token = lastToken("amanda@empresa.test");

  const row = getDb().prepare(`SELECT expires_at, created_at FROM verification_codes WHERE user_id = ? AND channel = 'email'`).get(user.id) as {
    expires_at: string;
    created_at: string;
  };
  const hours = (Date.parse(row.expires_at) - Date.parse(row.created_at)) / 3_600_000;
  assert.equal(Math.round(hours), 48);

  // Un antivirus o la vista previa abren el enlace: no debe gastarlo.
  assert.equal(emailTokenState(token), "valido");
  assert.equal(emailTokenState(token), "valido");
  assert.throws(() => assertCanPublish({ ...user, emailVerifiedAt: null }), is403("correo_sin_verificar"));

  assert.equal(confirmEmailToken(token), true);
  // Volver a abrir el mismo enlace después de confirmar no dice "venció".
  assert.equal(emailTokenState(token), "verificado");
  assert.equal(confirmEmailToken(token), true);
  assert.equal(emailTokenState("token-que-no-existe"), "invalido");
});

const is403 = (code: string) => (error: unknown) => error instanceof AppError && error.status === 403 && error.code === code;

test("enlace vencido y reenvío: el enlace anterior sigue válido hasta vencer", async () => {
  const { user } = signup("reenvio@empresa.test", "11.111.111-1");
  await startEmailVerification(user, { skipRate: true });
  const first = lastToken("reenvio@empresa.test");
  getDb().prepare(`UPDATE verification_codes SET created_at = ? WHERE user_id = ?`).run("2000-01-01T00:00:00.000Z", user.id);
  await resendEmailVerification("REENVIO@empresa.test ");
  assert.equal(outboxFor("reenvio@empresa.test").length, 2);
  const second = lastToken("reenvio@empresa.test");
  assert.notEqual(first, second);
  assert.equal(emailTokenState(first), "valido");

  getDb()
    .prepare(`UPDATE verification_codes SET expires_at = ? WHERE code_hash = (SELECT code_hash FROM verification_codes WHERE user_id = ? ORDER BY created_at LIMIT 1)`)
    .run("2000-01-01T00:00:00.000Z", user.id);
  assert.equal(emailTokenState(first), "invalido");
  assert.equal(confirmEmailToken(first), false);
  assert.equal(confirmEmailToken(second), true);

  // Reenvío para un correo inexistente o ya verificado: no envía nada y no revela nada.
  await resendEmailVerification("nadie@empresa.test");
  await resendEmailVerification("reenvio@empresa.test");
  assert.equal(outboxFor("nadie@empresa.test").length, 0);
  assert.equal(outboxFor("reenvio@empresa.test").length, 2);
});

test("re-registro con un correo sin confirmar ofrece reenviar; RUT duplicado se bloquea", () => {
  signup("pendiente@empresa.test", "22.222.222-2");
  assert.throws(() => signup("pendiente@empresa.test", "12.345.678-5"), is409("email_pendiente"));
  assert.throws(() => signup("otro@empresa.test", "22222222-2"), is409("rut_registrado"));
  assert.throws(
    () => signup("dv-malo@empresa.test", "22.222.222-3"),
    (error: unknown) => error instanceof AppError && /dígito verificador/.test(error.message),
  );
});

test("corregir datos: correo nuevo exige reconfirmar, RUT validado y único, WhatsApp normalizado", () => {
  const { user } = signup("corregir@empresa.test", "33.333.333-3", "transportista");
  getDb().prepare(`UPDATE users SET email_verified_at = ?, phone_verified_at = ? WHERE id = ?`).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", user.id);

  const changed = updateProfile(user.id, { email: "Corregido@Empresa.test", whatsapp: "+56 9 4444 5555", rut: "44444444-4" }, "self");
  assert.equal(changed.emailChanged, true);
  assert.equal(changed.user.email, "corregido@empresa.test");
  assert.equal(changed.user.emailVerifiedAt, null);
  assert.equal(changed.user.phoneVerifiedAt, null);
  assert.equal(changed.user.whatsapp, "56944445555");
  assert.equal(changed.user.rut, "44.444.444-4");

  assert.throws(() => updateProfile(user.id, { rut: "44.444.444-5" }, "self"), (e: unknown) => e instanceof AppError && /dígito/.test(e.message));
  assert.throws(() => updateProfile(user.id, { rut: "22.222.222-2" }, "self"), is409("rut_registrado"));
  assert.throws(() => updateProfile(user.id, { email: "pendiente@empresa.test" }, "self"), is409("email_registrado"));
  assert.throws(() => updateProfile(user.id, { whatsapp: "123" }, "self"), (e: unknown) => e instanceof AppError);

  // Cuenta verificada: el usuario ya no cambia el RUT, el administrador sí.
  getDb().prepare(`UPDATE users SET verification_status = 'verificado' WHERE id = ?`).run(user.id);
  assert.throws(() => updateProfile(user.id, { rut: "55.555.555-5" }, "self"), (e: unknown) => e instanceof AppError && e.status === 403);
  assert.equal(updateProfile(user.id, { rut: "55.555.555-5" }, "admin").user.rut, "55.555.555-5");
  // Mismo RUT con otro formato no cuenta como cambio.
  assert.equal(updateProfile(user.id, { rut: "55555555-5", contactName: "Nuevo Nombre" }, "self").user.contactName, "Nuevo Nombre");
});

test("el administrador borra registros pendientes, no cuentas verificadas ni administradoras", () => {
  const { user } = signup("borrar@empresa.test", "66.666.666-6");
  adminDeleteUser(user.id);
  assert.equal(getDb().prepare(`SELECT id FROM users WHERE id = ?`).get(user.id), undefined);

  const { user: ok } = signup("verificada@empresa.test", "77.777.777-7");
  setUserVerification(ok.id, "verificado", null);
  assert.throws(() => adminDeleteUser(ok.id), (e: unknown) => e instanceof AppError && e.status === 403);

  const admin = upsertAdmin({
    email: "admin-borrar@empresa.test",
    password: "clave-segura-1",
    razonSocial: "Admin",
    rut: "88.888.888-8",
    contactName: "Admin",
    whatsapp: "+56 9 1234 5678",
    city: "La Serena",
  });
  assert.throws(() => adminDeleteUser(admin.id), (e: unknown) => e instanceof AppError && e.status === 403);
  // El administrador puede publicar aunque su correo no esté confirmado.
  assert.doesNotThrow(() => assertCanPublish(admin));
});
