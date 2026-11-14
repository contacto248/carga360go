/**
 * Configuración del cliente de IA, compartida por WhatsApp y el chat de la web.
 *
 *  AI_PROVIDER=gemini  usa GEMINI_API_KEY (o AI_API_KEY) contra el endpoint
 *  compatible con OpenAI de Gemini. Sin AI_PROVIDER, si solo hay GEMINI_API_KEY,
 *  también se usa Gemini. En cualquier otro caso se mantiene la ruta OpenAI
 *  compatible (AI_API_KEY + AI_BASE_URL + AI_MODEL).
 *  Sin clave, ambos canales caen al motor de reglas.
 *
 *  GEMINI_MODEL         modelo de Gemini (por defecto gemini-3.5-flash-lite).
 *  AI_TIMEOUT_MS        timeout del cliente (por defecto 25000 en Gemini, 20000 en OpenAI).
 */

export const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
/** Flash lite de Gemini 3.5: disponible en el plan gratuito; gemini-2.5-* no aplica para esta cuenta. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_DEFAULT_TIMEOUT_MS = 25_000;

export type AiProvider = "gemini" | "openai";

export type AiConfig = {
  provider: AiProvider;
  key: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

function isGeminiRequested(): boolean {
  const provider = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (provider === "gemini") return true;
  if (provider === "openai") return false;
  return Boolean(process.env.GEMINI_API_KEY) && !process.env.AI_API_KEY;
}

export function aiConfig(): AiConfig {
  const env = process.env;
  if (isGeminiRequested()) {
    const timeoutMs = Number(env.AI_TIMEOUT_MS || GEMINI_DEFAULT_TIMEOUT_MS) || GEMINI_DEFAULT_TIMEOUT_MS;
    return {
      provider: "gemini",
      key: env.GEMINI_API_KEY || env.AI_API_KEY || "",
      baseUrl: (env.AI_BASE_URL || GEMINI_OPENAI_BASE).replace(/\/$/, ""),
      model: env.GEMINI_MODEL || env.AI_MODEL || GEMINI_DEFAULT_MODEL,
      timeoutMs,
    };
  }
  return {
    provider: "openai",
    key: env.AI_API_KEY || "",
    baseUrl: (env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: env.AI_MODEL || "gpt-4o-mini",
    timeoutMs: Number(env.AI_TIMEOUT_MS || 20000) || 20000,
  };
}

export function aiReady(): boolean {
  return Boolean(aiConfig().key);
}
