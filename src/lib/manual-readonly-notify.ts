import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { audit } from "./audit";
import { backupContactOf } from "./backup-contact";
import { getDb } from "./db";
import { isValidEmail, todayChile } from "./format";
import { mailOutboxDir } from "./mail";
import { sendEmail, type Delivery } from "./notify";
import {
  WA_TEMPLATE_READONLY_GRANTED,
  WA_TEMPLATE_READONLY_REVOKED,
  accreditationMissingItems,
  accreditationMissingShort,
  buildManualReadonlyGrantedEmail,
  buildManualReadonlyRevokedEmail,
  formatUntilDateCL,
  manualReadonlyGrantedWhatsapp,
  manualReadonlyRevokedWhatsapp,
} from "./onboarding/messages";
import { onboardingStatusOf } from "./onboarding/status";
import type { PublicUser } from "./types";
import { MAX_INBOUND_AGE_MS, canSend } from "./whatsapp/config";
import { sendWhatsappOutbound } from "./whatsapp/send";
import { lastInboundAtFor } from "./whatsapp/store";

export type NotifyKind = "otorgar" | "revocar";
export type RecipientSource = "principal" | "respaldo" | "ninguno";
export type ChannelStatus =
  | "smtp"
  | "whatsapp_sesion"
  | "whatsapp_plantilla"
  | "no_configurado"
  | "requiere_plantilla"
  | "sin_destinatario"
  | "error"
  | "omitido_mismo_dia";

export type ChannelResult = {
  status: ChannelStatus;
  label: string;
  to: string | null;
  source: RecipientSource;
  mode?: "sesion" | "plantilla" | null;
};

export type ManualReadonlyNoticeResult = {
  kind: NotifyKind;
  skipped: boolean;
  day: string;
  email: ChannelResult;
  whatsapp: ChannelResult;
};

export type NotifyActor = Pick<PublicUser, "id" | "email">;

type UserRow = {
  id: string;
  contact_name: string;
  email: string | null;
  whatsapp: string | null;
  verification_status: string;
};

const NOT_SENT_UNCONFIGURED = "no enviado: canal no configurado";

export function deliveryLabel(status: ChannelStatus): string {
  switch (status) {
    case "smtp":
      return "enviado por correo";
    case "whatsapp_sesion":
      return "enviado por WhatsApp (ventana de 24 h)";
    case "whatsapp_plantilla":
      return "enviado por WhatsApp (plantilla)";
    case "no_configurado":
      return NOT_SENT_UNCONFIGURED;
    case "requiere_plantilla":
      return "no enviado: requiere plantilla aprobada de Meta";
    case "sin_destinatario":
      return "no enviado: sin destinatario";
    case "error":
      return "no enviado: error de envío";
    case "omitido_mismo_dia":
      return "omitido: ya se avisó el mismo día";
  }
}

function wasSent(status: ChannelStatus): boolean {
  return status === "smtp" || status === "whatsapp_sesion" || status === "whatsapp_plantilla";
}

export function whatsappOutboxDir(): string {
  if (process.env.WA_OUTBOX) return process.env.WA_OUTBOX;
  return path.join(path.dirname(mailOutboxDir()), "whatsapp-outbox");
}

export function revokeNoticeEnabled(): boolean {
  return process.env.MANUAL_READONLY_REVOKE_NOTIFY !== "false";
}

export function grantedTemplateName(): string {
  return (process.env.WA_READONLY_TEMPLATE || "").trim();
}

export function revokedTemplateName(): string {
  return (process.env.WA_READONLY_REVOKE_TEMPLATE || "").trim();
}

export function templateLanguage(): string {
  return (process.env.WA_READONLY_TEMPLATE_LANG || "es").trim() || "es";
}

export function inCustomerCareWindow(lastInboundAt: string | null | undefined, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  const ts = Date.parse(lastInboundAt);
  return Number.isFinite(ts) && now.getTime() - ts <= MAX_INBOUND_AGE_MS;
}

export function ensureManualReadonlyNotifySchema(db = getDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS manual_readonly_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('otorgar', 'revocar')),
      day TEXT NOT NULL,
      email_to TEXT,
      email_source TEXT,
      email_status TEXT NOT NULL,
      whatsapp_to TEXT,
      whatsapp_source TEXT,
      whatsapp_status TEXT NOT NULL,
      whatsapp_mode TEXT,
      detail TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_manual_readonly_notifications_user_day
      ON manual_readonly_notifications(user_id, kind, day);
  `);
}

export type StoredNotice = {
  id: string;
  userId: string;
  kind: NotifyKind;
  day: string;
  emailTo: string | null;
  emailSource: RecipientSource;
  emailStatus: ChannelStatus;
  whatsappTo: string | null;
  whatsappSource: RecipientSource;
  whatsappStatus: ChannelStatus;
  whatsappMode: "sesion" | "plantilla" | null;
  detail: string | null;
  createdAt: string;
};

export function listManualReadonlyNotifications(userId: string): StoredNotice[] {
  ensureManualReadonlyNotifySchema();
  const rows = getDb()
    .prepare(
      `SELECT * FROM manual_readonly_notifications WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .all(userId) as {
    id: string;
    user_id: string;
    kind: NotifyKind;
    day: string;
    email_to: string | null;
    email_source: RecipientSource | null;
    email_status: ChannelStatus;
    whatsapp_to: string | null;
    whatsapp_source: RecipientSource | null;
    whatsapp_status: ChannelStatus;
    whatsapp_mode: "sesion" | "plantilla" | null;
    detail: string | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    day: row.day,
    emailTo: row.email_to,
    emailSource: row.email_source ?? "ninguno",
    emailStatus: row.email_status,
    whatsappTo: row.whatsapp_to,
    whatsappSource: row.whatsapp_source ?? "ninguno",
    whatsappStatus: row.whatsapp_status,
    whatsappMode: row.whatsapp_mode,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

function noticeForDay(userId: string, kind: NotifyKind, day: string): StoredNotice | null {
  ensureManualReadonlyNotifySchema();
  const row = getDb()
    .prepare(
      `SELECT * FROM manual_readonly_notifications WHERE user_id = ? AND kind = ? AND day = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId, kind, day) as
    | {
        id: string;
        user_id: string;
        kind: NotifyKind;
        day: string;
        email_to: string | null;
        email_source: RecipientSource | null;
        email_status: ChannelStatus;
        whatsapp_to: string | null;
        whatsapp_source: RecipientSource | null;
        whatsapp_status: ChannelStatus;
        whatsapp_mode: "sesion" | "plantilla" | null;
        detail: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    day: row.day,
    emailTo: row.email_to,
    emailSource: row.email_source ?? "ninguno",
    emailStatus: row.email_status,
    whatsappTo: row.whatsapp_to,
    whatsappSource: row.whatsapp_source ?? "ninguno",
    whatsappStatus: row.whatsapp_status,
    whatsappMode: row.whatsapp_mode,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

function insertNotice(
  userId: string,
  kind: NotifyKind,
  day: string,
  email: ChannelResult,
  whatsapp: ChannelResult,
  now: Date,
): void {
  ensureManualReadonlyNotifySchema();
  const detail = JSON.stringify({
    correo: { estado: email.label, para: email.to, origen: email.source },
    whatsapp: { estado: whatsapp.label, para: whatsapp.to, origen: whatsapp.source, modo: whatsapp.mode ?? null },
  });
  getDb()
    .prepare(
      `INSERT INTO manual_readonly_notifications
        (id, user_id, kind, day, email_to, email_source, email_status, whatsapp_to, whatsapp_source, whatsapp_status, whatsapp_mode, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      userId,
      kind,
      day,
      email.to,
      email.source,
      email.status,
      whatsapp.to,
      whatsapp.source,
      whatsapp.status,
      whatsapp.mode ?? null,
      detail.slice(0, 2000),
      now.toISOString(),
    );
}

function userRow(userId: string): UserRow | undefined {
  return getDb()
    .prepare(`SELECT id, contact_name, email, whatsapp, verification_status FROM users WHERE id = ?`)
    .get(userId) as UserRow | undefined;
}

export function resolveEmailRecipient(userId: string): { to: string; source: RecipientSource } | null {
  const row = userRow(userId);
  const email = (row?.email || "").trim().toLowerCase();
  if (email && isValidEmail(email)) return { to: email, source: "principal" };
  const backup = backupContactOf(userId);
  if (backup?.type === "email") return { to: backup.value, source: "respaldo" };
  return null;
}

export function resolveWhatsappRecipient(userId: string): { to: string; source: RecipientSource } | null {
  const row = userRow(userId);
  const primary = (row?.whatsapp || "").replace(/\D/g, "");
  if (/^569\d{8}$/.test(primary)) return { to: primary, source: "principal" };
  const backup = backupContactOf(userId);
  if (backup?.type === "telefono" && /^569\d{8}$/.test(backup.value)) {
    return { to: backup.value, source: "respaldo" };
  }
  return null;
}

function writeOutbox(dir: string, filename: string, body: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), body, { mode: 0o600 });
  } catch (error) {
    console.error("[carga360go] No se pudo guardar el aviso en outbox", error);
  }
}

function writeWhatsappOutbox(kind: NotifyKind, to: string | null, statusLabel: string, text: string, now: Date): void {
  const base = `${now.getTime()}-${kind}-${(to || "sin-destino").replace(/\W/g, "").slice(-12)}`;
  const body = [
    `Status: ${statusLabel}`,
    `To: ${to || "(sin destinatario)"}`,
    `Kind: ${kind}`,
    `At: ${now.toISOString()}`,
    "",
    text,
    "",
  ].join("\n");
  writeOutbox(whatsappOutboxDir(), `${base}.txt`, body);
}

function writeMailErrorOutbox(to: string, subject: string, text: string, statusLabel: string, now: Date): void {
  const base = `${now.getTime()}-error-${to.replace(/\W/g, "").slice(0, 32)}`;
  const body = [`Status: ${statusLabel}`, `To: ${to}`, `Subject: ${subject}`, `At: ${now.toISOString()}`, "", text, ""].join("\n");
  writeOutbox(mailOutboxDir(), `${base}.txt`, body);
}

function channel(status: ChannelStatus, to: string | null, source: RecipientSource, mode?: "sesion" | "plantilla" | null): ChannelResult {
  return { status, label: deliveryLabel(status), to, source, mode: mode ?? null };
}

function emptyResult(kind: NotifyKind, day: string, email: ChannelResult, whatsapp: ChannelResult, skipped = false): ManualReadonlyNoticeResult {
  return { kind, skipped, day, email, whatsapp };
}

async function sendGrantedEmail(to: string, source: RecipientSource, input: { contactName: string; untilIso: string; missing: string[] }, now: Date): Promise<ChannelResult> {
  const mail = buildManualReadonlyGrantedEmail(input);
  const delivery: Delivery = await sendEmail(to, mail.subject, mail.text, [], { html: mail.html });
  if (delivery === "smtp") return channel("smtp", to, source);
  if (delivery === "error") {
    writeMailErrorOutbox(to, mail.subject, mail.text, deliveryLabel("error"), now);
    return channel("error", to, source);
  }
  return channel("no_configurado", to, source);
}

async function sendRevokedEmail(to: string, source: RecipientSource, contactName: string, now: Date): Promise<ChannelResult> {
  const mail = buildManualReadonlyRevokedEmail(contactName);
  const delivery: Delivery = await sendEmail(to, mail.subject, mail.text, [], { html: mail.html });
  if (delivery === "smtp") return channel("smtp", to, source);
  if (delivery === "error") {
    writeMailErrorOutbox(to, mail.subject, mail.text, deliveryLabel("error"), now);
    return channel("error", to, source);
  }
  return channel("no_configurado", to, source);
}

async function sendWhatsappNotice(
  kind: NotifyKind,
  to: string,
  source: RecipientSource,
  text: string,
  template: { name: string; language: string; bodyParams: string[] } | null,
  userId: string,
  now: Date,
): Promise<ChannelResult> {
  if (!canSend()) {
    writeWhatsappOutbox(kind, to, NOT_SENT_UNCONFIGURED, text, now);
    return channel("no_configurado", to, source);
  }
  const lastIn = lastInboundAtFor(to, userId);
  if (inCustomerCareWindow(lastIn, now)) {
    const session = await sendWhatsappOutbound({ kind: "text", to, text });
    if (session.ok) return channel("whatsapp_sesion", to, source, "sesion");
  }
  if (template?.name) {
    const planted = await sendWhatsappOutbound({
      kind: "template",
      to,
      name: template.name,
      language: template.language,
      bodyParams: template.bodyParams,
    });
    if (planted.ok) return channel("whatsapp_plantilla", to, source, "plantilla");
    const msg = (planted.error || "").toLowerCase();
    const templateProblem =
      msg.includes("template") ||
      msg.includes("plantilla") ||
      msg.includes("132001") ||
      msg.includes("132005") ||
      msg.includes("131026") ||
      !inCustomerCareWindow(lastIn, now);
    const status: ChannelStatus = templateProblem ? "requiere_plantilla" : "error";
    writeWhatsappOutbox(kind, to, deliveryLabel(status), text, now);
    return channel(status, to, source, "plantilla");
  }
  const status: ChannelStatus = inCustomerCareWindow(lastIn, now) ? "error" : "requiere_plantilla";
  writeWhatsappOutbox(kind, to, deliveryLabel(status), text, now);
  return channel(status, to, source);
}

function missingFor(userId: string, now: Date, verificationStatus: string): string[] {
  return accreditationMissingItems(onboardingStatusOf(userId, now), verificationStatus);
}

function storedToResult(row: StoredNotice, skipped: boolean): ManualReadonlyNoticeResult {
  return {
    kind: row.kind,
    skipped,
    day: row.day,
    email: channel(row.emailStatus, row.emailTo, row.emailSource),
    whatsapp: channel(row.whatsappStatus, row.whatsappTo, row.whatsappSource, row.whatsappMode),
  };
}

function auditNotice(actor: NotifyActor | null, userId: string, result: ManualReadonlyNoticeResult, ip?: string | null) {
  const action = result.skipped ? "usuario.solo_lectura_aviso_omitido" : "usuario.solo_lectura_avisada";
  audit(
    actor,
    action,
    { type: "usuario", id: userId },
    {
      tipo: result.kind,
      dia: result.day,
      correo: { estado: result.email.label, para: result.email.to, origen: result.email.source },
      whatsapp: {
        estado: result.whatsapp.label,
        para: result.whatsapp.to,
        origen: result.whatsapp.source,
        modo: result.whatsapp.mode ?? null,
      },
    },
    ip,
  );
}

async function deliver(
  kind: NotifyKind,
  actor: NotifyActor | null,
  userId: string,
  untilIso: string | null,
  now: Date,
  ip?: string | null,
): Promise<ManualReadonlyNoticeResult> {
  const day = todayChile(now);
  const noneEmail = channel("sin_destinatario", null, "ninguno");
  const noneWa = channel("sin_destinatario", null, "ninguno");
  try {
    ensureManualReadonlyNotifySchema();
    const existing = noticeForDay(userId, kind, day);
    if (existing) {
      const result = storedToResult(existing, true);
      result.email = channel("omitido_mismo_dia", existing.emailTo, existing.emailSource);
      result.whatsapp = channel("omitido_mismo_dia", existing.whatsappTo, existing.whatsappSource, existing.whatsappMode);
      auditNotice(actor, userId, result, ip);
      return result;
    }
    const row = userRow(userId);
    if (!row) {
      const result = emptyResult(kind, day, noneEmail, noneWa);
      auditNotice(actor, userId, result, ip);
      return result;
    }
    const emailTo = resolveEmailRecipient(userId);
    const waTo = resolveWhatsappRecipient(userId);
    const contactName = (row.contact_name || "").trim() || "buenas";
    const missing = missingFor(userId, now, row.verification_status);
    const untilFmt = untilIso ? formatUntilDateCL(untilIso) : "";

    let email: ChannelResult = channel("sin_destinatario", null, "ninguno");
    if (emailTo) {
      email =
        kind === "otorgar" && untilIso
          ? await sendGrantedEmail(emailTo.to, emailTo.source, { contactName, untilIso, missing }, now)
          : await sendRevokedEmail(emailTo.to, emailTo.source, contactName, now);
    }

    const text =
      kind === "otorgar" && untilIso
        ? manualReadonlyGrantedWhatsapp({ contactName, untilIso, missing })
        : manualReadonlyRevokedWhatsapp(contactName);
    let whatsapp: ChannelResult = channel("sin_destinatario", null, "ninguno");
    if (waTo) {
      const templateName = kind === "otorgar" ? grantedTemplateName() : revokedTemplateName();
      const bodyParams = kind === "otorgar" && untilIso ? [contactName, untilFmt, accreditationMissingShort(missing)] : [contactName];
      whatsapp = await sendWhatsappNotice(
        kind,
        waTo.to,
        waTo.source,
        text,
        templateName ? { name: templateName, language: templateLanguage(), bodyParams } : null,
        userId,
        now,
      );
    } else {
      writeWhatsappOutbox(kind, null, deliveryLabel("sin_destinatario"), text, now);
    }

    const result = emptyResult(kind, day, email, whatsapp);
    insertNotice(userId, kind, day, email, whatsapp, now);
    auditNotice(actor, userId, result, ip);
    if (!wasSent(email.status) && !wasSent(whatsapp.status)) {
      console.log(
        `[carga360go] Aviso de solo lectura (${kind}) para ${userId}: correo=${email.label}; whatsapp=${whatsapp.label}`,
      );
    }
    return result;
  } catch (error) {
    console.error("[carga360go] No se pudo avisar la verificación manual", error);
    const result = emptyResult(kind, day, channel("error", null, "ninguno"), channel("error", null, "ninguno"));
    try {
      auditNotice(actor, userId, result, ip);
    } catch (auditError) {
      console.error("[carga360go] No se pudo auditar el aviso fallido", auditError);
    }
    return result;
  }
}

export async function notifyManualReadonlyGranted(input: {
  actor: NotifyActor | null;
  userId: string;
  until: string;
  ip?: string | null;
  now?: Date;
}): Promise<ManualReadonlyNoticeResult> {
  return deliver("otorgar", input.actor, input.userId, input.until, input.now ?? new Date(), input.ip);
}

export async function notifyManualReadonlyRevoked(input: {
  actor: NotifyActor | null;
  userId: string;
  ip?: string | null;
  now?: Date;
}): Promise<ManualReadonlyNoticeResult | null> {
  if (!revokeNoticeEnabled()) return null;
  return deliver("revocar", input.actor, input.userId, null, input.now ?? new Date(), input.ip);
}

export { WA_TEMPLATE_READONLY_GRANTED, WA_TEMPLATE_READONLY_REVOKED, NOT_SENT_UNCONFIGURED };
