/**
 * Configuración del cliente de IA, compartida por WhatsApp y el chat de la web.
 *
 *  El único proveedor es Gemini, por su endpoint compatible
 *  (GEMINI_OPENAI_BASE). AI_PROVIDER=gemini queda como interruptor documentado:
 *  otro valor no elige otro proveedor. Con GEMINI_API_KEY el cliente es Gemini;
 *  sin esa clave, ambos canales caen al motor de reglas.
 *
 *  GEMINI_API_KEY       única clave. AI_API_KEY no enciende el cliente.
 *  GEMINI_MODEL         modelo (por defecto gemini-3.5-flash-lite). AI_MODEL se ignora.
 *  AI_TIMEOUT_MS        timeout del cliente (por defecto 25000).
 *  AI_BASE_URL          se ignora: la URL queda fija en el endpoint de Gemini.
 */

export const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
/** Flash lite de Gemini 3.5: disponible en el plan gratuito; gemini-2.5-* no aplica para esta cuenta. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_DEFAULT_TIMEOUT_MS = 25_000;

export type AiProvider = "gemini";

export type AiConfig = {
  provider: AiProvider;
  key: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

export function aiConfig(): AiConfig {
  const env = process.env;
  const model = (env.GEMINI_MODEL || "").trim();
  return {
    provider: "gemini",
    key: env.GEMINI_API_KEY || "",
    baseUrl: GEMINI_OPENAI_BASE,
    model: model || GEMINI_DEFAULT_MODEL,
    timeoutMs: Number(env.AI_TIMEOUT_MS || GEMINI_DEFAULT_TIMEOUT_MS) || GEMINI_DEFAULT_TIMEOUT_MS,
  };
}

export function aiReady(): boolean {
  return Boolean(aiConfig().key);
}
