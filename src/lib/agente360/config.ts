/**
 * Clave de xAI (Grok) leída en cada request.
 * No hay una variable xAI previa en el repo. Si el cliente compatible ya
 * apunta a api.x.ai con AI_API_KEY (variable existente), se reutiliza esa.
 * Si no, se lee XAI_API_KEY. El acceso es dinámico para que el build no la fije.
 */

const XAI_BASE = "https://api.x.ai/v1";
export const XAI_MODEL = "grok-4.7";
/** Tope del servidor. El cliente no manda. */
export const AGENTE_MAX_TURNS = 6;
export const AGENTE_MAX_CHARS = 400;
export const AGENTE_MAX_COMPLETION_TOKENS = 200;

export type XaiRuntime = {
  key: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

function read(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

function xaiHost(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function xaiRuntime(env: NodeJS.ProcessEnv = process.env): XaiRuntime {
  const configuredBase = read(env, "AI_BASE_URL").replace(/\/$/, "");
  const pointsAtXai = xaiHost(configuredBase) === "api.x.ai";
  const existingKey = read(env, "AI_API_KEY");
  const dedicatedKey = read(env, "XAI_API_KEY");
  const key = pointsAtXai && existingKey ? existingKey : dedicatedKey;
  const timeoutRaw = Number(read(env, "AI_TIMEOUT_MS"));
  return {
    key,
    baseUrl: pointsAtXai && configuredBase ? configuredBase : XAI_BASE,
    model: XAI_MODEL,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw >= 5000 ? timeoutRaw : 25_000,
  };
}

export function xaiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(xaiRuntime(env).key);
}
