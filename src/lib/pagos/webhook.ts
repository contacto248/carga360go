import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validación de la firma de webhooks de Mercado Pago (spec §5.4).
 * x-signature: "ts=<segundos>,v1=<hex>"
 * Plantilla: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * HMAC-SHA256 hex con MP_WEBHOOK_SECRET, comparación en tiempo constante, ts con tolerancia.
 * Si data.id o x-request-id no vienen, su segmento se omite de la plantilla (como indica la doc).
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureCheck = { valid: boolean; reason: "ok" | "sin_secreto" | "sin_firma" | "formato" | "ts_vencido" | "firma_invalida"; ts?: number };

export function parseSignatureHeader(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  let ts = "";
  let v1 = "";
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  if (!/^\d{1,13}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return null;
  return { ts, v1: v1.toLowerCase() };
}

/** data.id alfanumérico va en minúsculas en la plantilla (doc oficial). */
export function normalizeDataId(dataId: string | null): string {
  if (!dataId) return "";
  return /[a-z]/i.test(dataId) ? dataId.toLowerCase() : dataId;
}

export function signatureManifest(dataId: string | null, requestId: string | null, ts: string): string {
  let manifest = "";
  const id = normalizeDataId(dataId);
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

export function signManifest(manifest: string, secret: string): string {
  return createHmac("sha256", secret).update(manifest, "utf8").digest("hex");
}

export function verifyMpSignature(input: {
  secret: string;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  nowMs?: number;
  toleranceSeconds?: number;
}): SignatureCheck {
  if (!input.secret) return { valid: false, reason: "sin_secreto" };
  if (!input.signatureHeader) return { valid: false, reason: "sin_firma" };
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed) return { valid: false, reason: "formato" };
  // MP envía ts en segundos; si llega en milisegundos, se normaliza.
  let tsSeconds = Number(parsed.ts);
  if (tsSeconds > 1e11) tsSeconds = Math.floor(tsSeconds / 1000);
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - tsSeconds) > tolerance) return { valid: false, reason: "ts_vencido", ts: tsSeconds };
  const expected = Buffer.from(signManifest(signatureManifest(input.dataId, input.requestId, parsed.ts), input.secret), "hex");
  const given = Buffer.from(parsed.v1, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { valid: false, reason: "firma_invalida", ts: tsSeconds };
  return { valid: true, reason: "ok", ts: tsSeconds };
}

export type MpNotification = {
  topic: string;
  action: string | null;
  eventId: string | null;
  resourceId: string | null;
  mpUserId: string | null;
  liveMode: boolean | null;
};

/** Lee tópico, acción e ids de un cuerpo de webhook (o de la query, formato antiguo). Nunca confía en montos ni estados del cuerpo. */
export function parseNotification(body: unknown, query: URLSearchParams): MpNotification {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data = b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : {};
  const str = (value: unknown) => (value == null || value === "" ? null : String(value));
  const topic = str(b.type) ?? str(b.topic) ?? query.get("type") ?? query.get("topic") ?? "desconocido";
  return {
    topic,
    action: str(b.action),
    eventId: str(b.id),
    resourceId: str(data.id) ?? query.get("data.id") ?? query.get("id"),
    mpUserId: str(b.user_id),
    liveMode: typeof b.live_mode === "boolean" ? b.live_mode : null,
  };
}

/** Copia del cuerpo sin claves que pudieran traer secretos. */
export function sanitizePayload(body: unknown): string {
  const drop = /token|secret|password|signature|authorization|card|cvv|security_code/i;
  const clean = (value: unknown, depth: number): unknown => {
    if (depth > 5) return "[...]";
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => clean(item, depth + 1));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value)) out[key] = drop.test(key) ? "[omitido]" : clean(inner, depth + 1);
      return out;
    }
    return typeof value === "string" ? value.slice(0, 300) : value;
  };
  return JSON.stringify(clean(body, 0)).slice(0, 4000);
}
