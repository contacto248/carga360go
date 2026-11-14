import { audit } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import { isValidRut, rutBody } from "../format";
import { appUrl } from "../mail";
import type { PublicUser } from "../types";
import { diditExpectedEnvironment, kycEnabled, KYC_MAX_ATTEMPTS } from "./config";
import { KYC_CONSENT_VERSION } from "./consent";
import { createDiditSession, getDiditDecision, type DiditDecision, type DiditStatus, type DiditWarning } from "./didit";
import { ensureKycSchema } from "./schema";

export const KYC_STATUSES = ["no_iniciado", "en_curso", "en_revision", "aprobado", "rechazado", "expirado"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  no_iniciado: "Sin verificar",
  en_curso: "Verificación en curso",
  en_revision: "En revisión manual",
  aprobado: "Identidad verificada",
  rechazado: "Verificación rechazada",
  expirado: "Verificación vencida o abandonada",
};

export type KycRecord = {
  userId: string;
  status: KycStatus;
  sessionId: string | null;
  providerStatus: string | null;
  attempts: number;
  consentAt: string | null;
  consentVersion: string | null;
  documentRun: string | null;
  documentName: string | null;
  runMatchesAccount: boolean | null;
  warnings: string[];
  decidedAt: string | null;
  decidedBy: string | null;
  adminNote: string | null;
  updatedAt: string | null;
};

type Row = {
  user_id: string;
  status: KycStatus;
  session_id: string | null;
  provider_status: string | null;
  attempts: number;
  consent_at: string | null;
  consent_version: string | null;
  document_run: string | null;
  document_name: string | null;
  run_matches_account: number | null;
  warnings: string | null;
  last_event_at: number | null;
  decided_at: string | null;
  decided_by: string | null;
  admin_note: string | null;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function toRecord(userId: string, row: Row | undefined): KycRecord {
  if (!row) {
    return {
      userId,
      status: "no_iniciado",
      sessionId: null,
      providerStatus: null,
      attempts: 0,
      consentAt: null,
      consentVersion: null,
      documentRun: null,
      documentName: null,
      runMatchesAccount: null,
      warnings: [],
      decidedAt: null,
      decidedBy: null,
      adminNote: null,
      updatedAt: null,
    };
  }
  let warnings: string[] = [];
  try {
    warnings = row.warnings ? (JSON.parse(row.warnings) as string[]) : [];
  } catch {
    warnings = [];
  }
  return {
    userId,
    status: row.status,
    sessionId: row.session_id,
    providerStatus: row.provider_status,
    attempts: row.attempts,
    consentAt: row.consent_at,
    consentVersion: row.consent_version,
    documentRun: row.document_run,
    documentName: row.document_name,
    runMatchesAccount: row.run_matches_account == null ? null : row.run_matches_account === 1,
    warnings,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    adminNote: row.admin_note,
    updatedAt: row.updated_at,
  };
}

function rowOf(userId: string): Row | undefined {
  ensureKycSchema();
  return getDb().prepare(`SELECT * FROM kyc_verifications WHERE user_id = ?`).get(userId) as Row | undefined;
}

export function kycOf(userId: string): KycRecord {
  return toRecord(userId, rowOf(userId));
}

/** Mapea el estado de Didit al estado propio de Carga360go. */
export function mapDiditStatus(status: string): KycStatus {
  switch (status as DiditStatus) {
    case "Approved":
      return "aprobado";
    case "Declined":
      return "rechazado";
    case "In Review":
      return "en_revision";
    case "Expired":
    case "Abandoned":
    case "Kyc Expired":
      return "expirado";
    case "Not Started":
    case "In Progress":
    case "Resubmitted":
    case "Awaiting User":
      return "en_curso";
    default:
      return "en_curso";
  }
}

// ---------- Inicio de la verificación ----------

export type StartResult = { url: string; sessionId: string; reused: boolean };

export async function startIdentityVerification(user: PublicUser, input: { consent: unknown; consentVersion?: unknown }): Promise<StartResult> {
  if (!kycEnabled()) throw new AppError("No encontrado.", 404);
  if (user.role === "admin") throw new AppError("La cuenta administradora no requiere verificación de identidad.");
  if (input.consent !== true) {
    throw new AppError("Para verificar tu identidad debes aceptar el consentimiento para el uso de datos biométricos.", 400, "kyc_consentimiento");
  }
  if (input.consentVersion !== undefined && input.consentVersion !== KYC_CONSENT_VERSION) {
    throw new AppError("El texto del consentimiento cambió. Recarga la página y vuelve a leerlo.", 409, "kyc_consentimiento_version");
  }
  if (!user.emailVerifiedAt) throw new AppError("Primero confirma tu correo. Después podrás verificar tu identidad.", 400, "kyc_correo");
  const current = kycOf(user.id);
  if (current.status === "aprobado") throw new AppError("Tu identidad ya está verificada.");
  if (current.status === "en_revision") throw new AppError("Tu verificación está en revisión. Te avisaremos cuando termine.");
  if (current.attempts >= KYC_MAX_ATTEMPTS && current.status !== "en_curso") {
    throw new AppError(
      `Llegaste al máximo de ${KYC_MAX_ATTEMPTS} intentos. Escríbenos a contacto@carga360go.cl y lo revisamos.`,
      429,
      "kyc_intentos",
    );
  }
  const consentAt = nowIso();
  const session = await createDiditSession({
    vendorData: user.id,
    callback: `${appUrl()}/verificar-identidad/resultado`,
    email: user.email,
    phoneE164: user.whatsapp ? `+${user.whatsapp.replace(/\D/g, "")}` : undefined,
    consentGivenAt: consentAt,
    consentVersion: KYC_CONSENT_VERSION,
    metadata: { plataforma: "carga360go", rol: user.role },
  });
  const db = getDb();
  const stamp = nowIso();
  const known = db.prepare(`SELECT user_id FROM kyc_sessions WHERE session_id = ?`).get(session.sessionId) as { user_id: string } | undefined;
  if (known && known.user_id !== user.id) throw new AppError("Sesión de verificación no válida.", 409);
  const reused = Boolean(known);
  db.transaction(() => {
    if (!known) {
      db.prepare(`INSERT INTO kyc_sessions (session_id, user_id, provider_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
        session.sessionId,
        user.id,
        session.status,
        stamp,
        stamp,
      );
    }
    db.prepare(
      `INSERT INTO kyc_verifications (user_id, status, created_at, updated_at) VALUES (?, 'no_iniciado', ?, ?)
       ON CONFLICT(user_id) DO NOTHING`,
    ).run(user.id, stamp, stamp);
    db.prepare(
      `UPDATE kyc_verifications SET status = 'en_curso', session_id = ?, provider_status = ?, consent_at = ?, consent_version = ?,
         decided_at = NULL, decided_by = NULL, updated_at = ? WHERE user_id = ?`,
    ).run(session.sessionId, session.status, consentAt, KYC_CONSENT_VERSION, stamp, user.id);
    if (!reused) {
      // Sesión nueva: cuenta como intento y se borra lo leído en la sesión anterior.
      db.prepare(
        `UPDATE kyc_verifications SET attempts = attempts + 1, document_run = NULL, document_name = NULL,
           run_matches_account = NULL, warnings = NULL, last_event_at = NULL WHERE user_id = ?`,
      ).run(user.id);
    }
  })();
  audit(user, "identidad.iniciada", { type: "usuario", id: user.id }, { sesion: session.sessionId, consentimiento: KYC_CONSENT_VERSION, reutilizada: reused });
  return { url: session.url, sessionId: session.sessionId, reused };
}

// ---------- Resultado (webhook o consulta) ----------

function collectWarnings(decision: DiditDecision | undefined): string[] {
  if (!decision) return [];
  const all: DiditWarning[] = [];
  for (const list of [decision.id_verifications, decision.liveness_checks, decision.face_matches, decision.database_validations]) {
    for (const item of list ?? []) all.push(...(item.warnings ?? []));
  }
  return [...new Set(all.map((w) => String(w.risk || w.short_description || "").slice(0, 60)).filter(Boolean))].slice(0, 20);
}

/** RUN leído de la cédula chilena (Didit lo entrega como personal_number; si no, se prueba document_number). */
export function documentRunOf(decision: DiditDecision | undefined): string | null {
  const id = decision?.id_verifications?.[0];
  if (!id) return null;
  for (const candidate of [id.personal_number, id.document_number]) {
    const clean = String(candidate ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
    if (clean.length >= 7 && isValidRut(clean)) return clean;
  }
  return null;
}

type Applied = { userId: string; status: KycStatus; changed: boolean };

function applyStatus(sessionId: string, providerStatus: string, decision: DiditDecision | undefined, eventAt: number, source: string): Applied | null {
  const db = getDb();
  const session = db.prepare(`SELECT user_id FROM kyc_sessions WHERE session_id = ?`).get(sessionId) as { user_id: string } | undefined;
  if (!session) return null;
  const stamp = nowIso();
  db.prepare(`UPDATE kyc_sessions SET provider_status = ?, updated_at = ? WHERE session_id = ?`).run(providerStatus, stamp, sessionId);
  const row = rowOf(session.user_id);
  // Solo la sesión vigente de la persona cambia su estado; eventos de sesiones antiguas se registran y nada más.
  if (!row || row.session_id !== sessionId) return { userId: session.user_id, status: row?.status ?? "no_iniciado", changed: false };
  // Didit no garantiza el orden: un evento más antiguo nunca pisa uno más nuevo.
  if (row.last_event_at != null && eventAt < row.last_event_at) return { userId: session.user_id, status: row.status, changed: false };
  // Una decisión manual del administrador manda sobre el proveedor.
  if (row.decided_by?.startsWith("admin:")) return { userId: session.user_id, status: row.status, changed: false };
  const status = mapDiditStatus(providerStatus);
  const user = db.prepare(`SELECT rut_norm, verification_status FROM users WHERE id = ?`).get(session.user_id) as
    | { rut_norm: string; verification_status: string }
    | undefined;
  if (!user) return null;
  const hasDecision = Boolean(decision) && (status === "aprobado" || status === "rechazado" || status === "en_revision");
  const run = hasDecision ? documentRunOf(decision) : null;
  const name = hasDecision ? (decision?.id_verifications?.[0]?.full_name ?? null) : null;
  const matches = run ? (rutBody(run) === user.rut_norm ? 1 : 0) : null;
  const warnings = hasDecision ? JSON.stringify(collectWarnings(decision)) : null;
  const terminal = status === "aprobado" || status === "rechazado";
  db.transaction(() => {
    db.prepare(
      `UPDATE kyc_verifications SET status = ?, provider_status = ?, last_event_at = ?,
         document_run = COALESCE(?, document_run), document_name = COALESCE(?, document_name),
         run_matches_account = COALESCE(?, run_matches_account), warnings = COALESCE(?, warnings),
         decided_at = ?, decided_by = ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(status, providerStatus, eventAt, run, name ? String(name).slice(0, 160) : null, matches, warnings, terminal ? stamp : null, terminal ? "didit" : null, stamp, session.user_id);
    // Si una identidad aprobada deja de estarlo, la cuenta aprobada vuelve a revisión (igual que los requisitos).
    if (status !== "aprobado" && row.status === "aprobado") {
      db.prepare(`UPDATE users SET verification_status = 'pendiente' WHERE id = ? AND verification_status = 'verificado'`).run(session.user_id);
    }
  })();
  if (row.status !== status) {
    audit(null, "identidad.resultado", { type: "usuario", id: session.user_id }, { estado: status, proveedor: providerStatus, origen: source });
  }
  return { userId: session.user_id, status, changed: row.status !== status };
}

export type WebhookPayload = {
  event_id?: string;
  webhook_type?: string;
  session_id?: string;
  status?: string;
  environment?: string;
  vendor_data?: string;
  created_at?: number;
  timestamp?: number;
  decision?: DiditDecision;
};

export type WebhookOutcome =
  | "aplicado"
  | "sin_cambio"
  | "duplicado"
  | "ignorado_tipo"
  | "ignorado_ambiente"
  | "ignorado_prueba"
  | "sesion_desconocida"
  | "datos_invalidos";

/** Procesa un webhook YA verificado (firma y timestamp). Idempotente por event_id. */
export function handleDiditWebhook(payload: WebhookPayload, opts: { testDelivery?: boolean } = {}): WebhookOutcome {
  ensureKycSchema();
  const db = getDb();
  const eventId = String(payload.event_id ?? "");
  const type = String(payload.webhook_type ?? "");
  const sessionId = String(payload.session_id ?? "");
  const status = String(payload.status ?? "");
  const eventAt = Number(payload.created_at ?? payload.timestamp ?? 0) || Math.floor(Date.now() / 1000);
  const record = (outcome: WebhookOutcome, userId: string | null = null): WebhookOutcome => {
    if (!eventId) return outcome;
    db.prepare(
      `INSERT OR IGNORE INTO kyc_events (event_id, session_id, user_id, webhook_type, provider_status, environment, event_created_at, outcome, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(eventId.slice(0, 80), sessionId.slice(0, 80) || null, userId, type.slice(0, 60), status.slice(0, 40) || null, String(payload.environment ?? "").slice(0, 20) || null, eventAt, outcome, nowIso());
    return outcome;
  };
  if (!eventId || eventId.length > 80) return "datos_invalidos";
  if (db.prepare(`SELECT 1 FROM kyc_events WHERE event_id = ?`).get(eventId)) return "duplicado";
  if (opts.testDelivery) return record("ignorado_prueba");
  if (type !== "status.updated" && type !== "data.updated") return record("ignorado_tipo");
  const expected = diditExpectedEnvironment();
  if (expected && payload.environment && payload.environment !== expected) return record("ignorado_ambiente");
  if (!sessionId || !status) return record("datos_invalidos");
  const applied = applyStatus(sessionId, status, payload.decision, eventAt, "webhook");
  if (!applied) return record("sesion_desconocida");
  if (payload.vendor_data && payload.vendor_data !== applied.userId) {
    console.error(`[carga360go] Webhook Didit: vendor_data no coincide con la sesión ${sessionId}`);
  }
  return record(applied.changed ? "aplicado" : "sin_cambio", applied.userId);
}

/** Cuando la persona vuelve del flujo: consulta la decisión al proveedor (no se confía en los parámetros de la URL). */
export async function syncFromProvider(user: PublicUser, sessionId: string): Promise<KycRecord> {
  if (!kycEnabled()) throw new AppError("No encontrado.", 404);
  ensureKycSchema();
  const owner = getDb().prepare(`SELECT user_id FROM kyc_sessions WHERE session_id = ?`).get(sessionId) as { user_id: string } | undefined;
  if (!owner || owner.user_id !== user.id) return kycOf(user.id);
  try {
    const decision = await getDiditDecision(sessionId);
    if (decision.status) applyStatus(sessionId, decision.status, decision, Math.floor(Date.now() / 1000), "consulta");
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
  return kycOf(user.id);
}

// ---------- Administración ----------

export function adminSetKyc(admin: PublicUser, userId: string, status: string, note: string | null): KycRecord {
  if (!kycEnabled()) throw new AppError("No encontrado.", 404);
  ensureKycSchema();
  const db = getDb();
  const target = db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as { role: string } | undefined;
  if (!target) throw new AppError("Usuario no encontrado.", 404);
  if (target.role === "admin") throw new AppError("La cuenta administradora no requiere verificación de identidad.");
  const stamp = nowIso();
  const cleanNote = note ? note.slice(0, 500) : null;
  if (status === "reiniciar") {
    // Permite un nuevo intento (por ejemplo, tras el máximo de intentos o una foto ilegible).
    db.prepare(
      `UPDATE kyc_verifications SET status = 'no_iniciado', attempts = 0, session_id = NULL, decided_at = NULL, decided_by = NULL,
         admin_note = ?, updated_at = ? WHERE user_id = ?`,
    ).run(cleanNote, stamp, userId);
    db.prepare(`UPDATE users SET verification_status = 'pendiente' WHERE id = ? AND verification_status = 'verificado'`).run(userId);
  } else if (status === "aprobado" || status === "rechazado") {
    if (status === "rechazado" && !cleanNote) throw new AppError("Indica el motivo del rechazo.");
    db.prepare(
      `INSERT INTO kyc_verifications (user_id, status, created_at, updated_at) VALUES (?, 'no_iniciado', ?, ?) ON CONFLICT(user_id) DO NOTHING`,
    ).run(userId, stamp, stamp);
    db.prepare(`UPDATE kyc_verifications SET status = ?, decided_at = ?, decided_by = ?, admin_note = ?, updated_at = ? WHERE user_id = ?`).run(
      status,
      stamp,
      `admin:${admin.id}`,
      cleanNote,
      stamp,
      userId,
    );
    if (status === "rechazado") {
      db.prepare(`UPDATE users SET verification_status = 'pendiente' WHERE id = ? AND verification_status = 'verificado'`).run(userId);
    }
  } else {
    throw new AppError("Estado no válido.");
  }
  audit(admin, "identidad.admin", { type: "usuario", id: userId }, { estado: status, nota: cleanNote });
  return kycOf(userId);
}

export type KycListItem = KycRecord & { email: string; razonSocial: string; contactName: string; role: string; rut: string };

export function listKyc(): KycListItem[] {
  ensureKycSchema();
  const rows = getDb()
    .prepare(
      `SELECT u.id AS uid, u.email, u.razon_social, u.contact_name, u.role, u.rut, k.*
       FROM users u LEFT JOIN kyc_verifications k ON k.user_id = u.id
       WHERE u.role <> 'admin' ORDER BY COALESCE(k.updated_at, u.created_at) DESC`,
    )
    .all() as (Row & { uid: string; email: string; razon_social: string; contact_name: string; role: string; rut: string })[];
  return rows.map((row) => ({
    ...toRecord(row.uid, row.user_id ? row : undefined),
    email: row.email,
    razonSocial: row.razon_social,
    contactName: row.contact_name,
    role: row.role,
    rut: row.rut,
  }));
}
