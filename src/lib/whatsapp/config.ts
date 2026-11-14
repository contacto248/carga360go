/**
 * Configuración del bot de WhatsApp.
 * Proveedor: WA_PROVIDER=meta (por defecto, Cloud API de Meta) o WA_PROVIDER=360dialog.
 * Todo se lee del entorno en cada llamada para que los tests y un reinicio con .env nuevo funcionen igual.
 *
 *  WA_PROVIDER          "meta" (defecto) o "360dialog"
 *  WA_VERIFY_TOKEN      token que Meta envía en hub.verify_token al registrar el webhook
 *  WA_APP_SECRET        secreto de la app de Meta; valida X-Hub-Signature-256 de cada POST
 *  WA_PHONE_NUMBER_ID   identificador del número (+56 9 5842 8693) en la Cloud API
 *  WA_WABA_ID           identificador de la cuenta de WhatsApp Business (referencia/diagnóstico)
 *  WA_ACCESS_TOKEN      token permanente de usuario del sistema (solo Meta)
 *  WA_360_API_KEY       clave de la Messaging API de 360dialog (header D360-API-KEY)
 *  WA_360_WEBHOOK_SECRET secreto compartido; 360dialog lo reenvía en X-Carga360-Secret
 *  WA_BOT_ENABLED       "true" para que el bot responda (por defecto apagado). El panel puede sobreescribirlo.
 *  WA_API_VERSION       versión de Graph API (por defecto v23.0, solo Meta)
 *  WA_HUMAN_PAUSE_HOURS horas que el bot calla en un chat después de que una persona responde desde la app (12)
 *  WA_HANDOFF_EMAIL     correo que recibe las derivaciones a humano (contacto@carga360go.cl)
 *  AI_PROVIDER / GEMINI_API_KEY / AI_API_KEY / AI_BASE_URL / AI_MODEL
 *                       cliente de IA (Gemini u OpenAI compatible). Sin clave se usa el motor de reglas.
 */

import { aiConfig, aiReady as assistantAiReady } from "../assistant/config";

export type WaProvider = "meta" | "360dialog";

export const WA_360_MESSAGES_URL = "https://waba-v2.360dialog.io/messages";
export const WA_360_WEBHOOK_CONFIG_URL = "https://waba-v2.360dialog.io/v1/configs/webhook";
export const WA_360_DEFAULT_WEBHOOK_URL = "https://carga360go.cl/api/whatsapp/webhook";
/** Header personalizado que 360dialog reenvía en cada webhook (su API admite headers arbitrarios). */
export const WA_360_WEBHOOK_HEADER = "X-Carga360-Secret";

export function waProvider(): WaProvider {
  return process.env.WA_PROVIDER === "360dialog" ? "360dialog" : "meta";
}

export function waConfig() {
  const env = process.env;
  const ai = aiConfig();
  return {
    provider: waProvider(),
    verifyToken: env.WA_VERIFY_TOKEN || "",
    appSecret: env.WA_APP_SECRET || "",
    phoneNumberId: env.WA_PHONE_NUMBER_ID || "",
    wabaId: env.WA_WABA_ID || "",
    accessToken: env.WA_ACCESS_TOKEN || "",
    apiKey360: env.WA_360_API_KEY || "",
    webhookSecret360: env.WA_360_WEBHOOK_SECRET || "",
    envEnabled: env.WA_BOT_ENABLED === "true",
    apiVersion: env.WA_API_VERSION || "v23.0",
    pauseHours: Math.max(1, Number(env.WA_HUMAN_PAUSE_HOURS || 12) || 12),
    handoffEmail: env.WA_HANDOFF_EMAIL || "contacto@carga360go.cl",
    aiProvider: ai.provider,
    aiKey: ai.key,
    aiBaseUrl: ai.baseUrl,
    aiModel: ai.model,
    aiTimeoutMs: ai.timeoutMs,
  };
}

export function canSend(): boolean {
  const c = waConfig();
  if (c.provider === "360dialog") return Boolean(c.apiKey360);
  return Boolean(c.phoneNumberId && c.accessToken);
}

export function aiReady(): boolean {
  return assistantAiReady();
}

/** Arma URL, headers y cuerpo para POST /messages según el proveedor. */
export function buildMessageRequest(payload: Record<string, unknown>): { url: string; headers: Record<string, string>; body: string } {
  const c = waConfig();
  const body = JSON.stringify(payload);
  if (c.provider === "360dialog") {
    return {
      url: WA_360_MESSAGES_URL,
      headers: { "D360-API-KEY": c.apiKey360, "Content-Type": "application/json" },
      body,
    };
  }
  return {
    url: `https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json" },
    body,
  };
}

/** Límite de respuestas del bot por chat. */
export const BOT_RATE = { perWindow: 8, windowMs: 10 * 60 * 1000, perDay: 60 };
/** Solo se responden mensajes recibidos hace menos de esto (ventana de atención de 24 h con margen). */
export const MAX_INBOUND_AGE_MS = 23 * 60 * 60 * 1000;
