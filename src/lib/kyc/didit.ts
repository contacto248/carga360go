import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "../errors";
import { diditApiBase, diditApiKey, diditWebhookSecret, diditWorkflowId, WEBHOOK_MAX_SKEW_S } from "./config";

/**
 * Cliente mínimo de la API de Didit (v3), sin dependencias.
 * Docs: https://docs.didit.me/reference/create-session-verification-sessions
 *       https://docs.didit.me/reference/webhooks
 * La API key nunca sale del servidor ni se escribe en logs.
 */

export type DiditStatus =
  | "Not Started"
  | "In Progress"
  | "Approved"
  | "Declined"
  | "In Review"
  | "Expired"
  | "Abandoned"
  | "Kyc Expired"
  | "Resubmitted"
  | "Awaiting User";

export type CreateSessionInput = {
  vendorData: string;
  callback: string;
  email?: string;
  phoneE164?: string;
  consentGivenAt: string;
  consentVersion: string;
  metadata?: Record<string, string>;
};

export type CreatedSession = { sessionId: string; url: string; status: DiditStatus };

export type DiditWarning = { risk?: string; short_description?: string; feature?: string };

export type DiditDecision = {
  session_id?: string;
  status?: DiditStatus;
  vendor_data?: string;
  id_verifications?: {
    status?: string;
    document_type?: string;
    document_number?: string;
    personal_number?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    issuing_state?: string;
    warnings?: DiditWarning[];
  }[];
  liveness_checks?: { status?: string; warnings?: DiditWarning[] }[];
  face_matches?: { status?: string; warnings?: DiditWarning[] }[];
  database_validations?: { status?: string; warnings?: DiditWarning[] }[];
};

type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...args) => fetch(...args);

/** Solo para pruebas: reemplaza fetch por un mock. */
export function setDiditFetch(impl: FetchLike | null) {
  fetchImpl = impl ?? ((...args) => fetch(...args));
}

function requireConfig() {
  if (!diditApiKey() || !diditWorkflowId()) {
    throw new AppError("La verificación de identidad aún no está configurada. Inténtalo más tarde.", 503, "kyc_no_configurado");
  }
}

export async function createDiditSession(input: CreateSessionInput): Promise<CreatedSession> {
  requireConfig();
  const body = {
    workflow_id: diditWorkflowId(),
    vendor_data: input.vendorData,
    callback: input.callback,
    callback_method: "both",
    language: "es",
    metadata: input.metadata ?? {},
    contact_details: {
      ...(input.email ? { email: input.email } : {}),
      ...(input.phoneE164 ? { phone: input.phoneE164 } : {}),
      send_notification_emails: false,
    },
    // Cédula de identidad chilena (incluye cédula para extranjeros, emitida en Chile).
    expected_details: { id_country: "CHL", expected_document_types: ["ID"] },
    // El consentimiento expreso se pide en carga360go.cl antes de abrir el flujo.
    biometric_consent: { given_at: input.consentGivenAt, text_version: input.consentVersion.slice(0, 64) },
  };
  const response = await fetchImpl(`${diditApiBase()}/v3/session/`, {
    method: "POST",
    headers: { "x-api-key": diditApiKey(), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`[carga360go] Didit create session falló (${response.status}): ${text}`);
    throw new AppError("No pudimos iniciar la verificación de identidad. Inténtalo de nuevo en unos minutos.", 502, "kyc_proveedor");
  }
  const data = (await response.json()) as { session_id?: string; url?: string; status?: DiditStatus };
  if (!data.session_id || !data.url) throw new AppError("Respuesta inesperada del proveedor de verificación.", 502, "kyc_proveedor");
  return { sessionId: data.session_id, url: data.url, status: data.status ?? "Not Started" };
}

/** Lee la decisión vigente (para conciliar cuando la persona vuelve del flujo o si un webhook se perdió). */
export async function getDiditDecision(sessionId: string): Promise<DiditDecision> {
  requireConfig();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(sessionId)) throw new AppError("Sesión no válida.");
  const response = await fetchImpl(`${diditApiBase()}/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
    headers: { "x-api-key": diditApiKey(), accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error(`[carga360go] Didit decision falló (${response.status}) para la sesión ${sessionId}`);
    throw new AppError("No pudimos consultar el resultado de la verificación.", 502, "kyc_proveedor");
  }
  return (await response.json()) as DiditDecision;
}

// ---------- Firma de webhooks ----------

/** Didit serializa los float enteros como enteros (100.0 → 100). JSON.parse ya los deja así en JS. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) out[key] = sortKeys((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/** JSON canónico de X-Signature-V2: llaves ordenadas, compacto, Unicode sin escapar. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeEqualHex(expected: string, given: string | null | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SignatureCheck = { ok: true; method: "v2" | "raw" } | { ok: false; reason: string };

/**
 * Verifica un webhook de Didit. Acepta X-Signature-V2 (recomendado) o X-Signature (bytes exactos),
 * y sus cabeceras -Previous durante una rotación del secreto. No acepta X-Signature-Simple
 * (obsoleta: no firma la decisión).
 */
export function verifyDiditSignature(
  rawBody: string,
  headers: Headers,
  opts: { secret?: string; nowS?: number } = {},
): SignatureCheck {
  const secret = opts.secret ?? diditWebhookSecret();
  if (!secret) return { ok: false, reason: "secreto_no_configurado" };
  const ts = Number(headers.get("x-timestamp"));
  if (!Number.isFinite(ts) || ts <= 0) return { ok: false, reason: "sin_timestamp" };
  const now = opts.nowS ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WEBHOOK_MAX_SKEW_S) return { ok: false, reason: "timestamp_vencido" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "json_invalido" };
  }
  const v2 = hmacHex(secret, canonicalJson(parsed));
  if (safeEqualHex(v2, headers.get("x-signature-v2")) || safeEqualHex(v2, headers.get("x-signature-v2-previous"))) {
    return { ok: true, method: "v2" };
  }
  const raw = hmacHex(secret, rawBody);
  if (safeEqualHex(raw, headers.get("x-signature")) || safeEqualHex(raw, headers.get("x-signature-previous"))) {
    return { ok: true, method: "raw" };
  }
  return { ok: false, reason: "firma_invalida" };
}

/** Firma un cuerpo como lo hace Didit (para pruebas y para el script de prueba local). */
export function signLikeDidit(body: unknown, secret: string, timestampS: number) {
  const raw = canonicalJson(body);
  return {
    raw,
    headers: {
      "content-type": "application/json",
      "x-timestamp": String(timestampS),
      "x-signature-v2": hmacHex(secret, raw),
      "x-signature": hmacHex(secret, raw),
    },
  };
}
