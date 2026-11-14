import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { PATCH as patchUsuario } from "../src/app/api/admin/usuarios/[id]/route";
import { createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { setBackupContact } from "../src/lib/backup-contact";
import { getDb } from "../src/lib/db";
import { rutDv } from "../src/lib/format";
import { mailOutboxDir } from "../src/lib/mail";
import { grantManualReadonly, revokeManualReadonly } from "../src/lib/manual-readonly";
import {
  deliveryLabel,
  inCustomerCareWindow,
  listManualReadonlyNotifications,
  notifyManualReadonlyGranted,
  notifyManualReadonlyRevoked,
  resolveEmailRecipient,
  resolveWhatsappRecipient,
  whatsappOutboxDir,
} from "../src/lib/manual-readonly-notify";
import {
  MANUAL_READONLY_GRANT_SUBJECT_PREFIX,
  MANUAL_READONLY_REVOKE_SUBJECT,
  WA_TEMPLATE_READONLY_GRANTED,
  WA_TEMPLATE_READONLY_REVOKED,
  accreditationMissingItems,
  accreditationMissingShort,
  buildManualReadonlyGrantedEmail,
  buildManualReadonlyRevokedEmail,
  formatUntilDateCL,
  manualReadonlyGrantedWhatsapp,
  manualReadonlyRevokedWhatsapp,
} from "../src/lib/onboarding/messages";
import { setWhatsappOutboundSender, type WhatsappOutboundPayload } from "../src/lib/whatsapp/send";
import { insertMessage, upsertConversation } from "../src/lib/whatsapp/store";

let seq = 40_000_000;
function nextRut(): string {
  seq += 1;
  return `${seq}-${rutDv(String(seq))}`;
}

function newUser(role: "transportista" | "mandante", tag: string, extra: { backupContact?: string } = {}) {
  const n = String(seq % 100_000_000).padStart(8, "0").slice(-8);
  return registerUser({
    role,
    razonSocial: `Aviso ${tag} SpA`,
    rut: nextRut(),
    contactName: "Camila Soto",
    email: `${tag}@aviso.test.cl`,
    password: "clave-segura-aviso-1",
    whatsapp: `+56 9 ${n.slice(0, 4)} ${n.slice(4)}`,
    city: "Antofagasta",
    ...extra,
  }).user;
}

const admin = () =>
  upsertAdmin({
    email: "admin-aviso@test.cl",
    password: "Admin-Clave-Larga-2026",
    razonSocial: "Admin Aviso",
    rut: "11.111.111-1",
    contactName: "Admin",
    whatsapp: "+56 9 1000 0010",
    city: "Santiago",
  });

function outboxFiles(dir: string, needle: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => {
    if (!name.endsWith(".txt")) return false;
    return fs.readFileSync(path.join(dir, name), "utf8").includes(needle);
  });
}

function readOutbox(dir: string, needle: string): string {
  const files = outboxFiles(dir, needle);
  assert.ok(files.length, `no hay archivo de outbox con ${needle} en ${dir}`);
  return fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8");
}

function audits(userId: string, action: string) {
  return getDb()
    .prepare(`SELECT action, detail FROM audit_log WHERE target_id = ? AND action = ? ORDER BY created_at ASC`)
    .all(userId, action) as { action: string; detail: string | null }[];
}

const BANNED = /comisi[oó]n|membres[ií]a|mercado pago|precio|cobro|tarifa comercial/i;

function assertClean(text: string) {
  assert.doesNotMatch(text, BANNED);
}

const LIMITS = [
  /solamente para ver la plataforma|solo para ver la plataforma/,
  /no puedes publicar ni tomar cargas, ofertar, editar ni operar/i,
  /acreditar/i,
  /\/panel/,
];

test("textos: el correo y el WhatsApp de otorgamiento incluyen límite, vencimiento, pendientes y panel", () => {
  const until = "2026-12-14T11:57:00.000Z";
  const missing = ["confirmar tu correo", "subir los documentos que faltan (cédula de identidad, licencia; van 0 de 6)"];
  const mail = buildManualReadonlyGrantedEmail({ contactName: "Camila Soto", untilIso: until, missing });
  const wa = manualReadonlyGrantedWhatsapp({ contactName: "Camila Soto", untilIso: until, missing });
  const date = formatUntilDateCL(until);
  assert.match(mail.subject, new RegExp(MANUAL_READONLY_GRANT_SUBJECT_PREFIX));
  assert.match(mail.subject, new RegExp(date));
  for (const text of [mail.text, mail.html, wa]) {
    assert.match(text, /Camila Soto/);
    assert.match(text, new RegExp(date));
    assert.match(text, /confirmar tu correo/);
    assert.match(text, /cédula de identidad/);
    for (const re of LIMITS) assert.match(text, re);
    assertClean(text);
  }
  const revokedMail = buildManualReadonlyRevokedEmail("Camila Soto");
  const revokedWa = manualReadonlyRevokedWhatsapp("Camila Soto");
  assert.equal(revokedMail.subject, MANUAL_READONLY_REVOKE_SUBJECT);
  for (const text of [revokedMail.text, revokedMail.html, revokedWa]) {
    assert.match(text, /fue revocado/);
    assert.match(text, /\/panel/);
    assertClean(text);
  }
  assert.equal(WA_TEMPLATE_READONLY_GRANTED.status, "pendiente_aprobacion_meta");
  assert.equal(WA_TEMPLATE_READONLY_REVOKED.status, "pendiente_aprobacion_meta");
  assert.match(WA_TEMPLATE_READONLY_GRANTED.body, /solo para ver la plataforma/);
  assert.match(accreditationMissingShort(missing), /confirmar tu correo/);
});

test("aviso: sin SMTP ni WhatsApp configurados se guarda en outbox y no se marca enviado", async () => {
  const root = admin();
  const user = newUser("transportista", "outbox-base", { backupContact: "respaldo.outbox@otro.cl" });
  const until = grantManualReadonly(root, user.id);
  const result = await notifyManualReadonlyGranted({ actor: root, userId: user.id, until, ip: "203.0.113.10" });
  assert.equal(result.skipped, false);
  assert.equal(result.email.status, "no_configurado");
  assert.equal(result.email.label, "no enviado: canal no configurado");
  assert.equal(result.email.to, user.email);
  assert.equal(result.email.source, "principal");
  assert.equal(result.whatsapp.status, "no_configurado");
  assert.equal(result.whatsapp.label, "no enviado: canal no configurado");
  assert.equal(result.whatsapp.source, "principal");

  const mail = readOutbox(mailOutboxDir(), `To: ${user.email}`);
  assert.match(mail, /solamente para ver la plataforma/);
  assert.match(mail, /No puedes publicar ni tomar cargas/);
  assert.match(mail, new RegExp(formatUntilDateCL(until)));
  assert.match(mail, /\/panel/);
  assertClean(mail);

  const wa = readOutbox(whatsappOutboxDir(), `To: ${user.whatsapp}`);
  assert.match(wa, /Status: no enviado: canal no configurado/);
  assert.match(wa, /solamente para ver la plataforma/);
  assert.match(wa, /\/panel/);
  assertClean(wa);

  const stored = listManualReadonlyNotifications(user.id);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].emailStatus, "no_configurado");
  assert.equal(stored[0].whatsappStatus, "no_configurado");
  const logged = audits(user.id, "usuario.solo_lectura_avisada");
  assert.equal(logged.length, 1);
  assert.match(logged[0].detail ?? "", /no enviado: canal no configurado/);
});

test("aviso: no se repite si se otorga dos veces el mismo día; al día siguiente sí se vuelve a avisar", async () => {
  const root = admin();
  const user = newUser("mandante", "mismo-dia", { backupContact: "+56 9 7000 0001" });
  const now = new Date("2026-11-14T12:00:00.000Z");
  const until = grantManualReadonly(root, user.id, now);
  const first = await notifyManualReadonlyGranted({ actor: root, userId: user.id, until, now });
  const secondUntil = grantManualReadonly(root, user.id, now);
  const second = await notifyManualReadonlyGranted({ actor: root, userId: user.id, until: secondUntil, now });
  assert.equal(first.skipped, false);
  assert.equal(second.skipped, true);
  assert.equal(second.email.status, "omitido_mismo_dia");
  assert.equal(second.whatsapp.status, "omitido_mismo_dia");
  assert.equal(listManualReadonlyNotifications(user.id).length, 1);
  assert.equal(audits(user.id, "usuario.solo_lectura_aviso_omitido").length, 1);

  const tomorrow = new Date("2026-11-15T12:00:00.000Z");
  const thirdUntil = grantManualReadonly(root, user.id, tomorrow);
  const third = await notifyManualReadonlyGranted({ actor: root, userId: user.id, until: thirdUntil, now: tomorrow });
  assert.equal(third.skipped, false);
  assert.equal(listManualReadonlyNotifications(user.id).length, 2);
});

test("aviso: si falta el correo o el WhatsApp principal se usa el contacto de respaldo", async () => {
  const root = admin();
  const user = newUser("mandante", "usa-respaldo", { backupContact: "respaldo.aviso@otro.cl" });
  setBackupContact(user.id, "+56 9 6111 2222");
  getDb().prepare(`UPDATE users SET email = ?, whatsapp = '' WHERE id = ?`).run(`sin-correo-${user.id}.local`, user.id);
  assert.deepEqual(resolveEmailRecipient(user.id), null);
  // el respaldo actual es teléfono; no hay correo de respaldo
  assert.deepEqual(resolveWhatsappRecipient(user.id), { to: "56961112222", source: "respaldo" });

  const withMail = newUser("mandante", "usa-respaldo-mail");
  setBackupContact(withMail.id, "otra.caja@otro.cl");
  getDb().prepare(`UPDATE users SET email = ? WHERE id = ?`).run(`sin-correo-${withMail.id}.local`, withMail.id);
  assert.deepEqual(resolveEmailRecipient(withMail.id), { to: "otra.caja@otro.cl", source: "respaldo" });

  const until = grantManualReadonly(root, withMail.id);
  const result = await notifyManualReadonlyGranted({ actor: root, userId: withMail.id, until });
  assert.equal(result.email.source, "respaldo");
  assert.equal(result.email.to, "otra.caja@otro.cl");
  assert.equal(result.email.status, "no_configurado");
  const mail = readOutbox(mailOutboxDir(), "To: otra.caja@otro.cl");
  assert.match(mail, /solamente para ver la plataforma/);
});

test("aviso: un fallo de envío no deshace la verificación y queda registrado como no enviado", async () => {
  const root = admin();
  const user = newUser("transportista", "falla-envio", { backupContact: "falla@otro.cl" });
  const until = grantManualReadonly(root, user.id);
  const now = new Date();
  const conv = upsertConversation({ waId: user.whatsapp, userId: user.id, name: "Camila" }, now.toISOString());
  assert.ok(conv);
  insertMessage({ conversationId: conv.id, direction: "in", source: "cliente", type: "text", body: "Hola", at: now.toISOString() });
  setWhatsappOutboundSender(async () => {
    throw new Error("red caída");
  });
  const prev = {
    token: process.env.WA_ACCESS_TOKEN,
    phone: process.env.WA_PHONE_NUMBER_ID,
  };
  process.env.WA_ACCESS_TOKEN = "token-de-prueba";
  process.env.WA_PHONE_NUMBER_ID = "123456";
  try {
    const result = await notifyManualReadonlyGranted({ actor: root, userId: user.id, until });
    assert.equal(result.whatsapp.status, "error");
    assert.match(result.whatsapp.label, /^no enviado:/);
    assert.ok(grantManualReadonly); // la cuenta sigue con solo lectura
    const row = getDb()
      .prepare(`SELECT manual_readonly_until FROM users WHERE id = ?`)
      .get(user.id) as { manual_readonly_until: string | null };
    assert.equal(row.manual_readonly_until, until);
  } finally {
    setWhatsappOutboundSender(null);
    if (prev.token === undefined) delete process.env.WA_ACCESS_TOKEN;
    else process.env.WA_ACCESS_TOKEN = prev.token;
    if (prev.phone === undefined) delete process.env.WA_PHONE_NUMBER_ID;
    else process.env.WA_PHONE_NUMBER_ID = prev.phone;
  }
});

test("aviso: dentro de la ventana de 24 h se envía texto de sesión; con plantilla configurada se usa plantilla", async () => {
  const root = admin();
  const sessionUser = newUser("mandante", "wa-sesion", { backupContact: "sesion@otro.cl" });
  const templateUser = newUser("mandante", "wa-plantilla", { backupContact: "plantilla@otro.cl" });
  const sent: WhatsappOutboundPayload[] = [];
  setWhatsappOutboundSender(async (payload) => {
    sent.push(payload);
    return { ok: true, wamid: `wamid-${payload.kind}` };
  });
  const prev = {
    token: process.env.WA_ACCESS_TOKEN,
    phone: process.env.WA_PHONE_NUMBER_ID,
    tpl: process.env.WA_READONLY_TEMPLATE,
  };
  process.env.WA_ACCESS_TOKEN = "token-de-prueba";
  process.env.WA_PHONE_NUMBER_ID = "123456";
  try {
    const now = new Date("2026-11-14T15:00:00.000Z");
    upsertConversation({ waId: sessionUser.whatsapp, userId: sessionUser.id, name: "Camila" }, now.toISOString());
    const conv = upsertConversation({ waId: sessionUser.whatsapp, userId: sessionUser.id }, now.toISOString());
    assert.ok(conv);
    insertMessage({
      conversationId: conv.id,
      direction: "in",
      source: "cliente",
      type: "text",
      body: "Hola",
      at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    });
    assert.equal(inCustomerCareWindow(new Date(now.getTime() - 60 * 60 * 1000).toISOString(), now), true);

    const untilSession = grantManualReadonly(root, sessionUser.id, now);
    const session = await notifyManualReadonlyGranted({ actor: root, userId: sessionUser.id, until: untilSession, now });
    assert.equal(session.whatsapp.status, "whatsapp_sesion");
    assert.equal(sent[0]?.kind, "text");
    if (sent[0] && sent[0].kind === "text") {
      assert.match(sent[0].text, /solamente para ver la plataforma/);
      assert.match(sent[0].text, /\/panel/);
    }

    process.env.WA_READONLY_TEMPLATE = WA_TEMPLATE_READONLY_GRANTED.name;
    const untilTpl = grantManualReadonly(root, templateUser.id, now);
    const planted = await notifyManualReadonlyGranted({ actor: root, userId: templateUser.id, until: untilTpl, now });
    assert.equal(planted.whatsapp.status, "whatsapp_plantilla");
    const tpl = sent.find((item) => item.kind === "template");
    assert.ok(tpl && tpl.kind === "template");
    assert.equal(tpl.name, WA_TEMPLATE_READONLY_GRANTED.name);
    assert.equal(tpl.bodyParams.length, 3);
    assert.equal(tpl.bodyParams[0], "Camila Soto");
  } finally {
    setWhatsappOutboundSender(null);
    if (prev.token === undefined) delete process.env.WA_ACCESS_TOKEN;
    else process.env.WA_ACCESS_TOKEN = prev.token;
    if (prev.phone === undefined) delete process.env.WA_PHONE_NUMBER_ID;
    else process.env.WA_PHONE_NUMBER_ID = prev.phone;
    if (prev.tpl === undefined) delete process.env.WA_READONLY_TEMPLATE;
    else process.env.WA_READONLY_TEMPLATE = prev.tpl;
  }
});

test("aviso: al revocar se envía un aviso corto, también sin marcar enviado si el canal no está", async () => {
  const root = admin();
  const user = newUser("mandante", "revoca-aviso", { backupContact: "revoca@otro.cl" });
  const now = new Date("2026-11-14T16:00:00.000Z");
  const until = grantManualReadonly(root, user.id, now);
  await notifyManualReadonlyGranted({ actor: root, userId: user.id, until, now });
  revokeManualReadonly(root, user.id, now);
  const result = await notifyManualReadonlyRevoked({ actor: root, userId: user.id, now });
  assert.ok(result);
  assert.equal(result.skipped, false);
  assert.equal(result.kind, "revocar");
  assert.equal(result.email.status, "no_configurado");
  const mail = readOutbox(mailOutboxDir(), MANUAL_READONLY_REVOKE_SUBJECT);
  assert.match(mail, /fue revocado/);
  assert.match(mail, /\/panel/);
  assertClean(mail);
  const wa = readOutbox(whatsappOutboxDir(), `Kind: revocar`);
  assert.match(wa, /Status: no enviado: canal no configurado/);
  assert.match(wa, /fue revocado/);
});

test("aviso: PATCH /api/admin/usuarios/:id otorga y dispara el aviso, aunque el canal no esté configurado", async () => {
  const root = admin();
  const user = newUser("transportista", "api-aviso", { backupContact: "api.aviso@otro.cl" });
  const token = createSession(root.id, { mfa: true });
  const response = await patchUsuario(
    new Request(`http://127.0.0.1:4317/api/admin/usuarios/${user.id}`, {
      method: "PATCH",
      headers: new Headers({
        "content-type": "application/json",
        "x-real-ip": "203.0.113.88",
        "sec-fetch-site": "same-origin",
        host: "127.0.0.1:4317",
        cookie: `c360_session=${token}`,
      }),
      body: JSON.stringify({ manualReadonly: "otorgar" }),
    }),
    { params: Promise.resolve({ id: user.id }) },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok?: boolean };
  assert.equal(body.ok, true);
  const row = getDb()
    .prepare(`SELECT manual_readonly_until FROM users WHERE id = ?`)
    .get(user.id) as { manual_readonly_until: string | null };
  assert.ok(row.manual_readonly_until);
  const notices = listManualReadonlyNotifications(user.id);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, "otorgar");
  assert.equal(notices[0].emailStatus, "no_configurado");
  assert.equal(audits(user.id, "usuario.solo_lectura_otorgada").length, 1);
  assert.equal(audits(user.id, "usuario.solo_lectura_avisada").length, 1);
  const mail = readOutbox(mailOutboxDir(), `To: ${user.email}`);
  assert.match(mail, /solamente para ver la plataforma/);
});

test("aviso: accreditationMissingItems cubre documentos, correo y revisión final", () => {
  const items = accreditationMissingItems(null, "pendiente");
  assert.ok(items.some((item) => /acreditaci/i.test(item)));
  assert.match(deliveryLabel("no_configurado"), /no enviado: canal no configurado/);
});
