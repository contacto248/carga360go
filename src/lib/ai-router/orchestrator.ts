import { callProvider, providerOrder, ProviderCallError, type ProviderErrorCode, type ProviderSuccess } from "./providers";
import type { ProviderId, RouterEnv, RouterMode } from "./config";

export type UsageDraft = {
  provider: ProviderId;
  model: string;
  mode: RouterMode;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  fallbackUsed: boolean;
  result: "ok" | "error";
  errorCode: ProviderErrorCode | null;
};

export type SideResult =
  | {
      provider: ProviderId;
      model: string;
      text: string;
      response_id: string | null;
      usage: { input_tokens: number; output_tokens: number };
      estimated_cost_usd: number;
      latency_ms: number;
    }
  | { error: ProviderErrorCode };

export type OrchestrateInput = {
  prompt: string;
  provider: RouterMode;
  maxOutputTokens: number;
  settings: RouterEnv;
  fetchImpl: typeof fetch;
  now?: () => number;
  traceId: string;
};

export type OrchestrateOutcome = {
  status: 200 | 502;
  body: Record<string, unknown>;
  usage: UsageDraft[];
};

function codeOf(error: unknown): ProviderErrorCode {
  return error instanceof ProviderCallError ? error.code : "NetworkError";
}

function sideOf(result: ProviderSuccess): SideResult {
  return {
    provider: result.provider,
    model: result.model,
    text: result.text,
    response_id: result.responseId,
    usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens },
    estimated_cost_usd: result.estimatedCostUsd,
    latency_ms: result.latencyMs,
  };
}

function draftOf(
  mode: RouterMode,
  provider: ProviderId,
  model: string,
  fallbackUsed: boolean,
  result: ProviderSuccess | null,
  error: ProviderErrorCode | null,
  latencyMs: number,
): UsageDraft {
  return {
    provider,
    model,
    mode,
    inputTokens: result?.inputTokens ?? 0,
    outputTokens: result?.outputTokens ?? 0,
    costUsd: result?.estimatedCostUsd ?? 0,
    latencyMs: result?.latencyMs ?? latencyMs,
    fallbackUsed,
    result: result ? "ok" : "error",
    errorCode: error,
  };
}

async function attempt(
  provider: ProviderId,
  input: OrchestrateInput,
  mode: RouterMode,
  fallbackUsed: boolean,
): Promise<{ ok: true; result: ProviderSuccess; draft: UsageDraft } | { ok: false; draft: UsageDraft; error: ProviderErrorCode }> {
  const started = (input.now ?? Date.now)();
  const model = provider === "openai" ? input.settings.openaiModel : input.settings.xaiModel;
  try {
    const result = await callProvider(provider, input.prompt, input.maxOutputTokens, input.settings, input.fetchImpl, input.now);
    return { ok: true, result, draft: draftOf(mode, provider, result.model, fallbackUsed, result, null, 0) };
  } catch (error) {
    const code = codeOf(error);
    const latency = Math.max(0, (input.now ?? Date.now)() - started);
    return { ok: false, error: code, draft: draftOf(mode, provider, model, fallbackUsed, null, code, latency) };
  }
}

export async function orchestrate(input: OrchestrateInput): Promise<OrchestrateOutcome> {
  const mode = input.provider;
  if (mode === "both") {
    const [openai, xai] = await Promise.all([
      attempt("openai", input, "both", false),
      attempt("xai", input, "both", false),
    ]);
    const pack = (side: Awaited<ReturnType<typeof attempt>>): SideResult => (side.ok ? sideOf(side.result) : { error: side.error });
    return {
      status: 200,
      body: { trace_id: input.traceId, results: { openai: pack(openai), xai: pack(xai) } },
      usage: [openai.draft, xai.draft],
    };
  }

  const order: ProviderId[] = mode === "auto" ? providerOrder(input.settings) : [mode, mode === "openai" ? "xai" : "openai"];
  const usage: UsageDraft[] = [];
  const errors: { provider: ProviderId; error: ProviderErrorCode }[] = [];
  for (let index = 0; index < order.length; index += 1) {
    const provider = order[index];
    const side = await attempt(provider, input, mode, index > 0);
    usage.push(side.draft);
    if (side.ok) {
      return {
        status: 200,
        body: { trace_id: input.traceId, fallback_used: index > 0, ...sideOf(side.result) },
        usage,
      };
    }
    errors.push({ provider, error: side.error });
  }
  return {
    status: 502,
    body: { trace_id: input.traceId, message: "Todos los proveedores fallaron", errors },
    usage,
  };
}
