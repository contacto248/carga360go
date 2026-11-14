import { createHmac, timingSafeEqual } from "crypto";
import { WA_360_WEBHOOK_HEADER, waConfig, waProvider } from "./config";

/** GET de verificación de Meta. Devuelve el challenge solo si el token coincide. 360dialog no usa este GET. */
export function verifyChallenge(params: URLSearchParams): { status: number; body: string } {
  const token = waConfig().verifyToken;
  const mode = params.get("hub.mode");
  const given = params.get("hub.verify_token") || "";
  const challenge = params.get("hub.challenge") || "";
  if (!token) return { status: 503, body: "Webhook no configurado" };
  if (mode === "subscribe" && safeEqual(given, token) && challenge) return { status: 200, body: challenge };
  return { status: 403, body: "Token inválido" };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Valida X-Hub-Signature-256 (HMAC-SHA256 del cuerpo crudo con el App Secret). */
export function validSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header, expected);
}

export type PostCheck = { status: number; process: boolean; payload: unknown; note: string };

type HeaderBag = { get(name: string): string | null };

function asHeaders(headers: HeaderBag | string | null | undefined): HeaderBag {
  if (headers && typeof headers === "object" && typeof headers.get === "function") return headers;
  const signature = typeof headers === "string" ? headers : null;
  return { get: (name: string) => (name.toLowerCase() === "x-hub-signature-256" ? signature : null) };
}

/** Sobres event/data de 360dialog (history, smb_app_state_sync, etc.), no el formato Cloud API. */
export function isNonCloudEnvelope(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const body = payload as { object?: unknown; event?: unknown; data?: unknown };
  return typeof body.event === "string" && body.data != null && body.object !== "whatsapp_business_account";
}

function parseBody(rawBody: string): PostCheck {
  try {
    const payload = JSON.parse(rawBody) as unknown;
    if (isNonCloudEnvelope(payload)) return { status: 200, process: false, payload, note: "sobre_ignorado" };
    return { status: 200, process: true, payload, note: "ok" };
  } catch {
    return { status: 400, process: false, payload: null, note: "json_invalido" };
  }
}

/**
 * Revisa un POST.
 * Meta: firma X-Hub-Signature-256 con WA_APP_SECRET.
 * 360dialog: header X-Carga360-Secret con WA_360_WEBHOOK_SECRET (la API de 360dialog
 * admite headers personalizados al configurar el webhook; Basic Auth también existiría,
 * pero usamos este secreto compartido).
 * Sin secreto no se procesa nada (respuesta 200 para que no reintenten).
 * El segundo argumento acepta Headers, o el valor de X-Hub-Signature-256 (compatibilidad).
 */
export function checkPost(rawBody: string, headers: HeaderBag | string | null | undefined): PostCheck {
  const bag = asHeaders(headers);
  if (waProvider() === "360dialog") {
    const secret = waConfig().webhookSecret360;
    if (!secret) return { status: 200, process: false, payload: null, note: "sin_secreto" };
    const given = bag.get(WA_360_WEBHOOK_HEADER) || bag.get(WA_360_WEBHOOK_HEADER.toLowerCase()) || "";
    if (!safeEqual(given, secret)) return { status: 401, process: false, payload: null, note: "secreto_invalido" };
    return parseBody(rawBody);
  }
  const secret = waConfig().appSecret;
  if (!secret) return { status: 200, process: false, payload: null, note: "sin_secreto" };
  const signature = bag.get("x-hub-signature-256") || bag.get("X-Hub-Signature-256");
  if (!validSignature(rawBody, signature, secret)) return { status: 401, process: false, payload: null, note: "firma_invalida" };
  return parseBody(rawBody);
}
