import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
import { isTrustedDevice, MAX_ATTEMPTS, maskEmail, startAdminChallenge, trustDevice, verifyAdminChallenge } from "../src/lib/admin-2fa";
import { createSession, loginUser, upsertAdmin, userFromToken, verifyCredentials } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import * as api from "../src/lib/mobile";
import { resetRateLimits } from "../src/lib/rate-limit";

const PASSWORD = "Admin-Clave-Larga-2026";
const admin = upsertAdmin({
  email: "contacto@admin2fa.test",
  password: PASSWORD,
  razonSocial: "Admin",
  rut: "78.553.352-6",
  contactName: "Administrador",
  whatsapp: "+56 9 5842 8693",
  city: "La Serena",
});

function mailbox() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    sent,
    send: async (to: string, subject: string, text: string) => {
      sent.push({ to, subject, text });
      return "smtp";
    },
    lastCode: () => /(\d{6})/.exec(sent[sent.length - 1]?.text ?? "")?.[1] ?? "",
  };
}

function clearChallenges() {
  getDb().prepare(`DELETE FROM login_challenges`).run();
}

test("el administrador no puede abrir sesión solo con la contraseña (web, app ni sesión sin segundo factor)", async () => {
  resetRateLimits();
  assert.throws(() => loginUser(admin.email, PASSWORD), (error: unknown) => error instanceof AppError && error.code === "requiere_2fa");
  const response = await api.login(
    new Request("http://127.0.0.1/api/mobile/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: admin.email, password: PASSWORD }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(verifyCredentials(admin.email, PASSWORD).id, admin.id);
  // Una sesión de administrador creada sin código no sirve.
  assert.equal(userFromToken(createSession(admin.id)), null);
  assert.equal(userFromToken(createSession(admin.id, { mfa: true }))?.id, admin.id);
});

test("código correcto abre sesión una sola vez; se envía al correo del administrador y se audita", async () => {
  clearChallenges();
  const box = mailbox();
  const { challengeId, sentTo } = await startAdminChallenge(admin, "1.2.3.4", { send: box.send });
  assert.equal(box.sent[0].to, admin.email);
  assert.equal(sentTo, maskEmail(admin.email));
  assert.match(box.lastCode(), /^\d{6}$/);
  const { user, token } = verifyAdminChallenge(challengeId, box.lastCode(), "1.2.3.4");
  assert.equal(user.id, admin.id);
  assert.equal(userFromToken(token)?.role, "admin");
  assert.throws(() => verifyAdminChallenge(challengeId, box.lastCode(), "1.2.3.4"), (error: unknown) => error instanceof AppError && error.code === "codigo_vencido");
  const actions = (getDb().prepare(`SELECT action FROM audit_log WHERE target_id = ?`).all(admin.id) as { action: string }[]).map((row) => row.action);
  assert.ok(actions.includes("admin.2fa_codigo_enviado") && actions.includes("admin.2fa_ok"));
});

test("5 intentos como máximo y el código vence a los 10 minutos", async () => {
  clearChallenges();
  const box = mailbox();
  const { challengeId } = await startAdminChallenge(admin, null, { send: box.send });
  const wrong = box.lastCode() === "000000" ? "111111" : "000000";
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
    assert.throws(() => verifyAdminChallenge(challengeId, wrong, null), (error: unknown) => error instanceof AppError && error.code === "codigo_incorrecto");
  }
  assert.throws(() => verifyAdminChallenge(challengeId, wrong, null), (error: unknown) => error instanceof AppError && error.code === "codigo_bloqueado");
  // Ni el código correcto sirve después de agotar los intentos.
  assert.throws(() => verifyAdminChallenge(challengeId, box.lastCode(), null), (error: unknown) => error instanceof AppError && error.code === "codigo_vencido");

  const second = await startAdminChallenge(admin, null, { send: box.send });
  getDb().prepare(`UPDATE login_challenges SET expires_at = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), second.challengeId);
  assert.throws(() => verifyAdminChallenge(second.challengeId, box.lastCode(), null), (error: unknown) => error instanceof AppError && error.code === "codigo_vencido");
  assert.throws(() => verifyAdminChallenge(null, "123456", null), (error: unknown) => error instanceof AppError && error.code === "codigo_vencido");
});

test("pedir un código nuevo anula el anterior y hay un máximo de 5 códigos cada 15 minutos", async () => {
  clearChallenges();
  const box = mailbox();
  const first = await startAdminChallenge(admin, null, { send: box.send });
  const firstCode = box.lastCode();
  const second = await startAdminChallenge(admin, null, { send: box.send });
  assert.throws(() => verifyAdminChallenge(first.challengeId, firstCode, null));
  assert.ok(second.challengeId);
  for (let i = 0; i < 3; i += 1) await startAdminChallenge(admin, null, { send: box.send });
  await assert.rejects(startAdminChallenge(admin, null, { send: box.send }), (error: unknown) => error instanceof AppError && error.status === 429);
  clearChallenges();
});

test("si el correo falla no queda un código válido", async () => {
  clearChallenges();
  await assert.rejects(
    startAdminChallenge(admin, null, { send: async () => "error" }),
    (error: unknown) => error instanceof AppError && error.code === "codigo_no_enviado",
  );
  const open = getDb().prepare(`SELECT COUNT(*) AS n FROM login_challenges WHERE consumed_at IS NULL`).get() as { n: number };
  assert.equal(open.n, 0);
});

test("dispositivo de confianza: válido 30 días solo para esa cuenta", () => {
  const token = trustDevice(admin.id, null, "test");
  assert.equal(isTrustedDevice(admin.id, token), true);
  assert.equal(isTrustedDevice("otra-cuenta", token), false);
  assert.equal(isTrustedDevice(admin.id, "token-falso"), false);
  getDb().prepare(`UPDATE trusted_devices SET expires_at = ?`).run(new Date(Date.now() - 1000).toISOString());
  assert.equal(isTrustedDevice(admin.id, token), false);
});
