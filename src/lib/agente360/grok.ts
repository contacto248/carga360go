import { AGENTE_MAX_CHARS, AGENTE_MAX_COMPLETION_TOKENS, AGENTE_MAX_TURNS, xaiRuntime, type XaiRuntime } from "./config";
import { promptAgente } from "./prompt";
import { AVISO_FALLO, AVISO_SIN_CLAVE, presentarRespuesta, quitarSecretos, secretosDeEntorno } from "./respuesta";

export type Turno = { role: "user" | "assistant"; content: string };

export type GrokDeps = {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  runtime?: XaiRuntime;
  operacion?: string;
  enlaceWhatsapp?: string | null;
};

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name = String(error.name);
  return name === "TimeoutError" || name === "AbortError";
}

function contenido(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = "choices" in data ? data.choices : null;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = "message" in choices[0] ? choices[0].message : null;
  if (!message || typeof message !== "object" || !("content" in message)) return "";
  return typeof message.content === "string" ? message.content : "";
}

export type GrokResult = { reply: string; failed: boolean };

/** Llama a xAI solo si hay clave. Si falta o la llamada falla, devuelve un texto de pantalla y no lanza. */
export async function consultarGrok(message: string, history: Turno[], deps: GrokDeps = {}): Promise<GrokResult> {
  const env = deps.env ?? process.env;
  const runtime = deps.runtime ?? xaiRuntime(env);
  const secrets = secretosDeEntorno(env);
  if (!runtime.key) return { reply: AVISO_SIN_CLAVE, failed: false };

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: promptAgente(deps.operacion || "Sin lectura de publicaciones en este momento.", deps.enlaceWhatsapp ?? null) },
  ];
  for (const turn of history.slice(-AGENTE_MAX_TURNS)) {
    const content = quitarSecretos(turn.content, secrets).trim().slice(0, AGENTE_MAX_CHARS);
    if (content) messages.push({ role: turn.role, content });
  }
  const last = messages[messages.length - 1];
  const cleanMessage = quitarSecretos(message, secrets).trim().slice(0, AGENTE_MAX_CHARS);
  if (!cleanMessage) return { reply: AVISO_FALLO, failed: true };
  if (!last || last.role !== "user" || last.content !== cleanMessage) {
    messages.push({ role: "user", content: cleanMessage });
  }

  const call = deps.fetchImpl ?? fetch;
  try {
    const response = await call(`${runtime.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: runtime.model,
        messages,
        temperature: 0.3,
        max_completion_tokens: AGENTE_MAX_COMPLETION_TOKENS,
        stream: false,
        reasoning_effort: "low",
        search_parameters: { mode: "off" },
      }),
      signal: AbortSignal.timeout(runtime.timeoutMs),
    });
    if (!response.ok) {
      console.error(`[carga360go] agente 360go xAI (${response.status})`);
      return { reply: AVISO_FALLO, failed: true };
    }
    const data: unknown = await response.json().catch(() => null);
    return { reply: presentarRespuesta(contenido(data), secrets), failed: false };
  } catch (error) {
    console.error(`[carga360go] agente 360go xAI ${isTimeout(error) ? "timeout" : "error"}`);
    return { reply: AVISO_FALLO, failed: true };
  }
}
