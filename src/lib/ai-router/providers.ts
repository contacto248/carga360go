import { OPENAI_URL, XAI_URL, scrubSecrets, type ProviderId, type RouterEnv } from "./config";

export type ProviderErrorCode = "ProviderDisabled" | "Timeout" | "UpstreamError" | "NetworkError" | "InvalidResponse";

export class ProviderCallError extends Error {
  readonly code: ProviderErrorCode;
  /** Código saneado del cuerpo de OpenAI. Nunca el mensaje ni la clave. */
  readonly upstreamCode: string | null;

  constructor(code: ProviderErrorCode, upstreamCode: string | null = null) {
    super(code);
    this.name = code;
    this.code = code;
    this.upstreamCode = upstreamCode;
  }
}

const UPSTREAM_CODE = /^[A-Za-z0-9._:-]{1,64}$/;

/** Token corto de diagnóstico. Rechaza mensajes, claves y cualquier otro texto. */
export function sanitizeUpstreamCode(value: unknown, secrets: string[] = []): string | null {
  if (typeof value !== "string") return null;
  const scrubbed = scrubSecrets(value, secrets).trim();
  if (!UPSTREAM_CODE.test(scrubbed)) return null;
  if (/^sk[-_]/i.test(scrubbed)) return null;
  return scrubbed;
}

function codeFromPayload(data: unknown, secrets: string[]): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { error?: unknown; code?: unknown; type?: unknown };
  const nested = record.error;
  const candidates: unknown[] = [];
  if (nested && typeof nested === "object") {
    const bag = nested as { code?: unknown; type?: unknown };
    candidates.push(bag.code, bag.type);
  } else if (typeof nested === "string") {
    candidates.push(nested);
  }
  candidates.push(record.code, record.type);
  for (const candidate of candidates) {
    const safe = sanitizeUpstreamCode(candidate, secrets);
    if (safe) return safe;
  }
  return null;
}

async function openAiUpstreamCode(response: Response, secrets: string[]): Promise<string | null> {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    return null;
  }
  if (raw.length > 4096) raw = raw.slice(0, 4096);
  try {
    return codeFromPayload(JSON.parse(raw), secrets);
  } catch {
    return null;
  }
}

export type ProviderSuccess = {
  provider: ProviderId;
  model: string;
  text: string;
  responseId: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
};

function tokens(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000_000 ? value : 0;
}

function outputText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if ((part as { type?: unknown }).type !== "output_text") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n");
}

export function estimateCost(inputTokens: number, outputTokens: number, inputPerM: number, outputPerM: number): number {
  const raw = (inputTokens * inputPerM) / 1_000_000 + (outputTokens * outputPerM) / 1_000_000;
  return Math.round(raw * 1e8) / 1e8;
}

export async function callProvider(
  provider: ProviderId,
  prompt: string,
  maxOutputTokens: number,
  settings: RouterEnv,
  fetchImpl: typeof fetch,
  now: () => number = Date.now,
): Promise<ProviderSuccess> {
  const key = provider === "openai" ? settings.openaiKey : settings.xaiKey;
  const model = provider === "openai" ? settings.openaiModel : settings.xaiModel;
  const prices = settings.prices[provider];
  if (!key) throw new ProviderCallError("ProviderDisabled");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  const started = now();
  try {
    let response: Response;
    try {
      response = await fetchImpl(provider === "openai" ? OPENAI_URL : XAI_URL, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: prompt,
          max_output_tokens: maxOutputTokens,
          store: false,
        }),
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new ProviderCallError("Timeout");
      }
      throw new ProviderCallError("NetworkError");
    }
    if (!response.ok) {
      const secrets = [settings.openaiKey, settings.xaiKey];
      let upstream: string | null = null;
      if (provider === "openai") {
        const parsed = await openAiUpstreamCode(response, secrets);
        upstream = parsed ?? (response.status === 403 ? "http_403" : null);
        const status = Number.isInteger(response.status) ? response.status : 0;
        console.error(`[carga360go] ai-router openai status=${status} error_code=${upstream ?? "UpstreamError"}`);
      }
      throw new ProviderCallError("UpstreamError", upstream);
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ProviderCallError("InvalidResponse");
    }
    const usage = data && typeof data === "object" ? (data as { usage?: unknown }).usage : undefined;
    const bag = usage && typeof usage === "object" ? (usage as { input_tokens?: unknown; output_tokens?: unknown }) : {};
    const inputTokens = tokens(bag.input_tokens);
    const outputTokens = tokens(bag.output_tokens);
    const rawId = data && typeof data === "object" ? (data as { id?: unknown }).id : null;
    const secrets = [settings.openaiKey, settings.xaiKey];
    return {
      provider,
      model,
      text: scrubSecrets(outputText(data), secrets),
      responseId: typeof rawId === "string" ? scrubSecrets(rawId, secrets) : null,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(inputTokens, outputTokens, prices.input, prices.output),
      latencyMs: Math.max(0, now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Más barato primero. El texto del prompt no entra en la cuenta. Empate: OpenAI queda antes. */
export function providerOrder(settings: RouterEnv): ProviderId[] {
  const ranked: { id: ProviderId; sum: number }[] = [];
  if (settings.openaiKey) ranked.push({ id: "openai", sum: settings.prices.openai.input + settings.prices.openai.output });
  if (settings.xaiKey) ranked.push({ id: "xai", sum: settings.prices.xai.input + settings.prices.xai.output });
  ranked.sort((a, b) => a.sum - b.sum);
  return ranked.map((item) => item.id);
}
