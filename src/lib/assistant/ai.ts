import { aiConfig } from "./config";
import { HANDOFF_TOKEN, systemPrompt, type ChatChannel } from "./prompt";
import { finishAiCall, reserveAiCall } from "./usage";
import type { LiveContext } from "../whatsapp/intents";

export { HANDOFF_TOKEN, systemPrompt };
export type { ChatChannel };

export type ChatTurn = { direction: "in" | "out"; body: string };

export type AiResult = { text: string; handoff: boolean; engine: string };

export type AiSkipReason = "apagada" | "sin_clave" | "limite";
export type AiFailReason = "http" | "timeout" | "vacio" | "filtro" | "red";

export type AiOutcome =
  | { attempt: "omitido"; reason: AiSkipReason; result: null }
  | { attempt: "fallido"; reason: AiFailReason; result: null }
  | { attempt: "ok"; reason: null; result: AiResult };

export type AiDeps = { fetchImpl?: typeof fetch; timeoutMs?: number };

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "TimeoutError" || name === "AbortError";
}

/** Cliente compatible con OpenAI. Sin clave, apagado o sin cupo no llama al proveedor. */
export async function aiReply(
  history: ChatTurn[],
  userText: string,
  live: LiveContext,
  channel: ChatChannel = "whatsapp",
  deps?: AiDeps,
): Promise<AiOutcome> {
  const cfg = aiConfig();
  if (!cfg.key) return { attempt: "omitido", reason: "sin_clave", result: null };
  const reserved = reserveAiCall();
  if ("reason" in reserved) return { attempt: "omitido", reason: reserved.reason, result: null };
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [{ role: "system", content: systemPrompt(live, channel) }];
  for (const msg of history.slice(-10)) {
    if (!msg.body) continue;
    messages.push({ role: msg.direction === "in" ? "user" : "assistant", content: msg.body.slice(0, 1000) });
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content !== userText.slice(0, 1000)) messages.push({ role: "user", content: userText.slice(0, 1000) });
  const call = deps?.fetchImpl ?? fetch;
  try {
    const response = await call(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.3, max_tokens: 350 }),
      signal: AbortSignal.timeout(deps?.timeoutMs ?? cfg.timeoutMs),
    });
    if (!response.ok) {
      console.error(`[carga360go] IA ${channel} falló (${response.status})`);
      finishAiCall(reserved.id, { status: "error", fallbackReason: "http", provider: cfg.provider, model: cfg.model });
      return { attempt: "fallido", reason: "http", result: null };
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    let text = String(data.choices?.[0]?.message?.content || "").trim();
    const promptTokens = tokenCount(data.usage?.prompt_tokens);
    const completionTokens = tokenCount(data.usage?.completion_tokens);
    if (!text) {
      finishAiCall(reserved.id, { status: "error", fallbackReason: "vacio", provider: cfg.provider, model: cfg.model, promptTokens, completionTokens });
      return { attempt: "fallido", reason: "vacio", result: null };
    }
    const handoff = text.includes(HANDOFF_TOKEN);
    text = text.split(HANDOFF_TOKEN).join("").trim();
    if (!isSafeReply(text)) {
      finishAiCall(reserved.id, { status: "error", fallbackReason: "filtro", provider: cfg.provider, model: cfg.model, promptTokens, completionTokens });
      return { attempt: "fallido", reason: "filtro", result: null };
    }
    finishAiCall(reserved.id, { status: "ok", fallbackReason: null, provider: cfg.provider, model: cfg.model, promptTokens, completionTokens });
    return { attempt: "ok", reason: null, result: { text: text.slice(0, 1200), handoff, engine: `ia:${cfg.provider}:${cfg.model}` } };
  } catch (error) {
    const timeout = isTimeout(error);
    console.error(`[carga360go] IA ${channel} ${timeout ? "timeout" : "error"}`);
    finishAiCall(reserved.id, {
      status: timeout ? "timeout" : "error",
      fallbackReason: timeout ? "timeout" : "red",
      provider: cfg.provider,
      model: cfg.model,
    });
    return { attempt: "fallido", reason: timeout ? "timeout" : "red", result: null };
  }
}

/** Filtro final: si la IA menciona algo prohibido, se usa el motor de reglas. */
export function isSafeReply(text: string): boolean {
  if (!text) return false;
  if (/bassam|miner(í|i)a|\bminer[oa]s?\b/i.test(text)) return false;
  return true;
}
