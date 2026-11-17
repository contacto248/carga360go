import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { acceptPrivacyFor, accreditationOf, approveCarrier, isAccredited, setRequirement } from "../src/lib/accreditation";
import { registerUser } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { rutDv } from "../src/lib/format";
import { KYC_GRACE_DAYS } from "../src/lib/kyc/config";
import {
  KYC_CONSENT_PARAGRAPHS,
  KYC_CONSENT_VERSION,
  KYC_RETENTION_IMAGES_DAYS_PROPOSED,
  KYC_RETENTION_PENDING_CONFIRMATION,
  KYC_RETENTION_RESULTS_MONTHS_AFTER_CLOSE_PROPOSED,
} from "../src/lib/kyc/consent";
import {
  draftKycGraceReminder,
  graceOf,
  graceReminderKindDue,
  snapshotAccreditedForGrace,
} from "../src/lib/kyc/grace";
import { ensureKycSchema } from "../src/lib/kyc/schema";
import { mailOutboxDir } from "../src/lib/mail";
import { privacyVersion, PRIVACY_VERSION_BASE, PRIVACY_VERSION_KYC } from "../src/lib/privacy";
import { policyMeta, policySections } from "../src/lib/privacy-policy";
import { whatsappOtpInboundEnabled } from "../src/lib/notify";
import type { PublicUser } from "../src/lib/types";
import {
  confirmPhoneCode,
  confirmPhoneFromWhatsapp,
  parseInboundOtpCode,
  phoneOtpPrefilledText,
  startPhoneVerification,
} from "../src/lib/verification";
import { processWebhookPayload, setSender } from "../src/lib/whatsapp/bot";

let seq = 61_000_000;

function onKyc() {
  process.env.KYC_FEATURE_ENABLED = "true";
}
function offKyc() {
  delete process.env.KYC_FEATURE_ENABLED;
}
function onInbound() {
  process.env.WHATSAPP_OTP_INBOUND_ENABLED = "true";
}
function offInbound() {
  delete process.env.WHATSAPP_OTP_INBOUND_ENABLED;
}

function newUser(role: "mandante" | "transportista", tag: string): PublicUser {
  seq += 1;
  return registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: `${seq}-${rutDv(String(seq))}`,
    contactName: `Contacto ${tag}`,
    email: `${tag}@kyc-lanzamiento.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 6111 2345",
    city: "La Serena",
  }).user;
}

function accreditWithoutKyc(user: PublicUser) {
  const stamp = new Date().toISOString();
  getDb().prepare(`UPDATE users SET email_verified_at = ?, phone_verified_at = ? WHERE id = ?`).run(stamp, stamp, user.id);
  acceptPrivacyFor(user.id);
  for (const key of ["calidad", "seguridad", "medioambiente"]) setRequirement(user.id, key, "cumple");
  approveCarrier("admin", user.id);
}

test("flags apagados por defecto: política 1.2, sin OTP entrante y sin plazo de gracia", () => {
  offKyc();
  offInbound();
  assert.equal(process.env.KYC_FEATURE_ENABLED, undefined);
  assert.equal(process.env.WHATSAPP_OTP_INBOUND_ENABLED, undefined);
  assert.equal(whatsappOtpInboundEnabled(), false);
  assert.equal(privacyVersion(), PRIVACY_VERSION_BASE);
  assert.equal(policyMeta().version, "1.5-2026-11-17");
  assert.equal(policySections().some((section) => section.id === "identidad"), false);
  const user = newUser("mandante", "flags-off");
  assert.equal(graceOf(user.id), null);
  assert.deepEqual(
    accreditationOf(user.id).items.map((item) => item.key),
    ["privacidad", "correo", "calidad", "seguridad", "medioambiente", "aprobacion"],
  );
});

test("con el flag, se publica la política 1.3 con la sección de identidad y sin Registro Civil", () => {
  offKyc();
  const before = policySections().map((section) => section.id);
  onKyc();
  try {
    assert.equal(privacyVersion(), PRIVACY_VERSION_KYC);
    assert.equal(policyMeta().version, "1.6-2026-11-17");
    const sections = policySections();
    assert.ok(sections.some((section) => section.id === "identidad"));
    const text = JSON.stringify(sections);
    assert.match(text, /datos biométricos/);
    assert.match(text, /No consultamos el RUN ante el Registro Civil/);
    assert.match(text, /30 días/);
    assert.match(text, /12 meses/);
    assert.doesNotMatch(text, /Si se activa, también la validación del RUN/);
    assert.equal(KYC_CONSENT_VERSION, "kyc-1.0-2026-11-11");
    assert.equal(KYC_RETENTION_PENDING_CONFIRMATION, true);
    assert.equal(KYC_RETENTION_IMAGES_DAYS_PROPOSED, 30);
    assert.equal(KYC_RETENTION_RESULTS_MONTHS_AFTER_CLOSE_PROPOSED, 12);
    assert.ok(KYC_CONSENT_PARAGRAPHS.some((p) => p.includes("como máximo 30 días")));
    assert.equal(policySections().every((section) => !/BASSAM/i.test(JSON.stringify(section))), true);
  } finally {
    offKyc();
    assert.deepEqual(policySections().map((section) => section.id), before);
  }
});

test("OTP entrante: código hasheado, vence en 10 min, solo se confirma desde el WhatsApp registrado y no se responde", async () => {
  offKyc();
  onInbound();
  const sent: { to: string | null; text: string }[] = [];
  setSender(async (to, text) => {
    sent.push({ to: to.waId, text });
    return { ok: true, wamid: "wamid.out.test" };
  });
  try {
    const user = newUser("mandante", "otp-in");
    assert.equal(user.whatsapp, "56961112345");
    const started = await startPhoneVerification(user);
    assert.equal(started.delivery, "whatsapp_inbound");
    assert.ok(started.waLink?.startsWith("https://wa.me/56958428693?text="));
    assert.match(started.prefilledText || "", /C360GO-\d{6}/);
    const code = parseInboundOtpCode(started.prefilledText);
    assert.ok(code && code.length === 6);
    const row = getDb()
      .prepare(`SELECT code_hash, delivery, expires_at, created_at, target FROM verification_codes WHERE user_id = ? AND channel = 'phone'`)
      .get(user.id) as { code_hash: string; delivery: string; expires_at: string; created_at: string; target: string };
    assert.equal(row.delivery, "whatsapp_inbound");
    assert.equal(row.target, user.whatsapp);
    assert.notEqual(row.code_hash, code);
    assert.equal(row.code_hash.includes(code), false);
    const minutes = (Date.parse(row.expires_at) - Date.parse(row.created_at)) / 60_000;
    assert.equal(Math.round(minutes), 10);
    // Ingresar el código en la web no confirma: hay que enviarlo desde el número registrado.
    assert.throws(() => confirmPhoneCode(user, code), (error: unknown) => error instanceof AppError && /WhatsApp/.test(error.message));
    assert.equal((getDb().prepare(`SELECT phone_verified_at FROM users WHERE id = ?`).get(user.id) as { phone_verified_at: null }).phone_verified_at, null);

    // Un precio u otro 6 dígitos no es un código.
    assert.equal(parseInboundOtpCode("El flete sale 150000 pesos"), null);
    assert.equal(confirmPhoneFromWhatsapp(user.whatsapp, "150000"), "no_aplica");

    // Otro número envía el código correcto: no verifica la cuenta.
    assert.equal(confirmPhoneFromWhatsapp("56999998888", phoneOtpPrefilledText(code)), "codigo_invalido");
    assert.equal((getDb().prepare(`SELECT phone_verified_at FROM users WHERE id = ?`).get(user.id) as { phone_verified_at: null }).phone_verified_at, null);

    // El webhook confirma y el bot no responde (el reply se cobraria).
    process.env.WA_BOT_ENABLED = "true";
    process.env.WA_PHONE_NUMBER_ID = "111";
    process.env.WA_ACCESS_TOKEN = "x";
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "111" },
                contacts: [{ wa_id: user.whatsapp, profile: { name: "Contacto" } }],
                messages: [
                  {
                    id: `wamid.in.otp.${user.id}`,
                    from: user.whatsapp,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: started.prefilledText },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const results = await processWebhookPayload(payload);
    assert.deepEqual(results, ["otp_confirmado"]);
    assert.equal(sent.length, 0, "no se envía ningún WhatsApp de salida");
    const verified = getDb().prepare(`SELECT phone_verified_at FROM users WHERE id = ?`).get(user.id) as { phone_verified_at: string | null };
    assert.ok(verified.phone_verified_at);

    const other = newUser("mandante", "otp-rate");
    // Forzar un número distinto
    getDb().prepare(`UPDATE users SET whatsapp = ? WHERE id = ?`).run("56961119999", other.id);
    const first = await startPhoneVerification({ ...other, whatsapp: "56961119999" });
    assert.equal(first.delivery, "whatsapp_inbound");
    await assert.rejects(
      () => startPhoneVerification({ ...other, whatsapp: "56961119999" }),
      (error: unknown) => error instanceof AppError && error.status === 429,
    );

    // Código vencido
    const late = newUser("mandante", "otp-exp");
    getDb().prepare(`UPDATE users SET whatsapp = ? WHERE id = ?`).run("56961118888", late.id);
    const expiredStart = await startPhoneVerification({ ...late, whatsapp: "56961118888" });
    getDb().prepare(`UPDATE verification_codes SET expires_at = ? WHERE user_id = ?`).run("2000-01-01T00:00:00.000Z", late.id);
    assert.equal(confirmPhoneFromWhatsapp("56961118888", expiredStart.prefilledText || ""), "vencido");
  } finally {
    offInbound();
    setSender(null);
    delete process.env.WA_BOT_ENABLED;
    delete process.env.WA_PHONE_NUMBER_ID;
    delete process.env.WA_ACCESS_TOKEN;
  }
});

test("plazo de gracia de 15 días: la cuenta acreditada sigue activa, hay recordatorios redactados (no enviados) y luego pasa a pendiente", () => {
  offKyc();
  const user = newUser("mandante", "gracia");
  accreditWithoutKyc(user);
  assert.equal(isAccredited({ ...user, role: "mandante" }), true);

  onKyc();
  try {
    ensureKycSchema();
    snapshotAccreditedForGrace();
    acceptPrivacyFor(user.id); // acepta la política 1.3 que se publica con el flag
    const acc = accreditationOf(user.id);
    assert.equal(acc.accredited, true);
    assert.ok(acc.grace?.active);
    assert.equal(acc.grace?.daysLeft, KYC_GRACE_DAYS);
    assert.ok(acc.items.some((item) => item.key === "identidad" && !item.ok));
    assert.equal(isAccredited({ ...user, role: "mandante" }), true);

    const outboxBefore = fs.existsSync(mailOutboxDir()) ? fs.readdirSync(mailOutboxDir()).length : 0;
    const inicio = draftKycGraceReminder({ email: user.email, contactName: user.contactName }, acc.grace!, "inicio");
    const mitad = draftKycGraceReminder({ email: user.email, contactName: user.contactName }, { ...acc.grace!, daysLeft: 7 }, "mitad");
    const ultimo = draftKycGraceReminder({ email: user.email, contactName: user.contactName }, { ...acc.grace!, daysLeft: 1 }, "ultimo");
    assert.equal(inicio.to, user.email);
    assert.match(inicio.subject, /15 días/);
    assert.match(inicio.text, /verificar-identidad/);
    assert.doesNotMatch(inicio.text, /BASSAM/i);
    assert.match(mitad.text, /mitad del plazo/);
    assert.match(ultimo.subject, /Últimos días/);
    assert.equal(graceReminderKindDue(acc.grace!), "inicio");
    const outboxAfter = fs.existsSync(mailOutboxDir()) ? fs.readdirSync(mailOutboxDir()).length : 0;
    assert.equal(outboxAfter, outboxBefore, "los recordatorios se redactan y no se envían");

    getDb().prepare(`UPDATE kyc_grace SET ends_at = ? WHERE user_id = ?`).run("2000-01-01T00:00:00.000Z", user.id);
    const after = accreditationOf(user.id);
    assert.equal(after.grace?.active, false);
    assert.equal(after.accredited, false);
    const status = getDb().prepare(`SELECT verification_status FROM users WHERE id = ?`).get(user.id) as { verification_status: string };
    assert.equal(status.verification_status, "pendiente");
  } finally {
    offKyc();
  }
});
