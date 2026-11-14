import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { addDaysIso, freePeriodOf, freeUntilFrom } from "../src/lib/campaign";
import { todayChile } from "../src/lib/format";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
import { getDb } from "../src/lib/db";
import { rutDv } from "../src/lib/format";
import * as api from "../src/lib/mobile";
import { assertPrivacyAccepted, PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";
import { resetRateLimits } from "../src/lib/rate-limit";

let seq = 31_000_000;
function rut(): string {
  seq += 1;
  return `${seq}-${rutDv(String(seq))}`;
}
function signupBody(email: string, extra: Record<string, unknown>) {
  return {
    kind: "mandante",
    razonSocial: `Empresa ${email}`,
    rut: rut(),
    contactName: "Contacto Prueba",
    email,
    password: "camino-seguro-748",
    whatsapp: "+56 9 1234 5678",
    city: "Santiago",
    ...extra,
  };
}
function post(body: unknown) {
  return new Request("http://127.0.0.1:4317/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "10.9.0.1" },
    body: JSON.stringify(body),
  });
}

test("la aceptación de privacidad debe ser exactamente true", () => {
  for (const value of [undefined, false, "true", "on", 1, null]) {
    assert.throws(() => assertPrivacyAccepted({ acceptPrivacy: value }), /Política de Privacidad/);
  }
  assert.equal(assertPrivacyAccepted({ acceptPrivacy: true }), PRIVACY_VERSION);
});

test("registro sin aceptar la política se rechaza y no crea la cuenta", async () => {
  resetRateLimits();
  const response = await api.register(post(signupBody("sin-acepta@test.cl", {})));
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code?: string; error?: string };
  assert.match(JSON.stringify(body), /privacidad_requerida|Política de Privacidad/);
  const row = getDb().prepare(`SELECT id FROM users WHERE email = ?`).get("sin-acepta@test.cl");
  assert.equal(row, undefined);
});

test("registro aceptando solo la privacidad (sin Términos de uso) se rechaza", async () => {
  resetRateLimits();
  const response = await api.register(post(signupBody("sin-terminos@test.cl", { acceptPrivacy: true })));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /terminos_requeridos|Términos de uso/);
  assert.equal(getDb().prepare(`SELECT id FROM users WHERE email = ?`).get("sin-terminos@test.cl"), undefined);
});

test("registro aceptando guarda fecha, versión, términos, periodo gratis y auditoría", async () => {
  resetRateLimits();
  const response = await api.register(post(signupBody("acepta@test.cl", { acceptPrivacy: true, acceptTerms: true })));
  assert.equal(response.status, 201, await response.clone().text());
  const row = getDb().prepare(`SELECT id, privacy_accepted_at, privacy_version FROM users WHERE email = ?`).get("acepta@test.cl") as {
    id: string;
    privacy_accepted_at: string | null;
    privacy_version: string | null;
  };
  assert.equal(row.privacy_version, PRIVACY_VERSION);
  assert.ok(row.privacy_accepted_at && !Number.isNaN(Date.parse(row.privacy_accepted_at)));
  const log = getDb()
    .prepare(`SELECT detail FROM audit_log WHERE action = 'usuario.privacidad_aceptada' AND target_id = ?`)
    .get(row.id) as { detail: string } | undefined;
  assert.ok(log && log.detail.includes(PRIVACY_VERSION) && log.detail.includes(TERMS_VERSION));
  const extra = getDb().prepare(`SELECT terms_version, terms_accepted_at, free_until, created_at FROM users WHERE id = ?`).get(row.id) as {
    terms_version: string;
    terms_accepted_at: string;
    free_until: string;
    created_at: string;
  };
  assert.equal(extra.terms_version, TERMS_VERSION);
  assert.ok(extra.terms_accepted_at);
  assert.equal(extra.free_until, addDaysIso(todayChile(new Date(extra.created_at)), 30));
});

test("periodo gratis por cuenta: 30 días desde la inscripción y estado según hoy", () => {
  assert.equal(freeUntilFrom("2026-11-10T15:00:00.000Z"), "2026-12-10");
  // 02:00 UTC del 11 es aún 10 de noviembre en Chile (UTC-3).
  assert.equal(freeUntilFrom("2026-11-11T02:00:00.000Z"), "2026-12-10");
  assert.deepEqual(freePeriodOf("2026-12-10", "2026-11-10"), { freeUntil: "2026-12-10", label: "10-12-2026", active: true, daysLeft: 30 });
  assert.equal(freePeriodOf("2026-12-10", "2026-12-10")?.active, true);
  assert.equal(freePeriodOf("2026-12-10", "2026-12-11")?.active, false);
  assert.equal(freePeriodOf(null), null);
});
