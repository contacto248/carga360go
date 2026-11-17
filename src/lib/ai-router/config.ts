/**
 * Se lee en cada request. Solo el texto exacto "true" enciende el flag.
 * No consulta OPS_FEATURE_ENABLED.
 */

export const AI_ROUTER_FLAG = "AI_ROUTER_ENABLED";

export type ProviderId = "openai" | "xai";
export type RouterMode = "auto" | "openai" | "xai" | "both";

export const OPENAI_URL = "https://api.openai.com/v1/responses";
export const XAI_URL = "https://api.x.ai/v1/responses";
export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
export const DEFAULT_XAI_MODEL = "grok-4.7";
export const DEFAULT_TIMEOUT_SECONDS = 120;

const DEFAULT_PRICES = {
  openai: { input: 0.25, output: 2 },
  xai: { input: 2, output: 6 },
} as const;

export type RouterEnv = {
  openaiKey: string;
  xaiKey: string;
  openaiModel: string;
  xaiModel: string;
  timeoutMs: number;
  prices: {
    openai: { input: number; output: number };
    xai: { input: number; output: number };
  };
};

export function aiRouterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[AI_ROUTER_FLAG] === "true";
}

function text(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

function modelName(raw: string, fallback: string, secret: string): string {
  if (!raw || raw.length > 80 || raw === secret) return fallback;
  if (!/^[A-Za-z0-9._:-]+$/.test(raw)) return fallback;
  return raw;
}

function price(raw: string, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return fallback;
  return n;
}

function timeoutMs(raw: string): number {
  if (!raw) return DEFAULT_TIMEOUT_SECONDS * 1000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 300) return DEFAULT_TIMEOUT_SECONDS * 1000;
  return Math.round(n * 1000);
}

export function readRouterEnv(env: NodeJS.ProcessEnv = process.env): RouterEnv {
  const openaiKey = text(env, "OPENAI_API_KEY");
  const xaiKey = text(env, "XAI_API_KEY");
  return {
    openaiKey,
    xaiKey,
    openaiModel: modelName(text(env, "OPENAI_MODEL"), DEFAULT_OPENAI_MODEL, openaiKey),
    xaiModel: modelName(text(env, "XAI_MODEL"), DEFAULT_XAI_MODEL, xaiKey),
    timeoutMs: timeoutMs(text(env, "PROVIDER_TIMEOUT_SECONDS")),
    prices: {
      openai: {
        input: price(text(env, "OPENAI_INPUT_USD_PER_M"), DEFAULT_PRICES.openai.input),
        output: price(text(env, "OPENAI_OUTPUT_USD_PER_M"), DEFAULT_PRICES.openai.output),
      },
      xai: {
        input: price(text(env, "XAI_INPUT_USD_PER_M"), DEFAULT_PRICES.xai.input),
        output: price(text(env, "XAI_OUTPUT_USD_PER_M"), DEFAULT_PRICES.xai.output),
      },
    },
  };
}

export function scrubSecrets(value: string, secrets: string[]): string {
  let out = value;
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    out = out.split(secret).join("");
  }
  return out;
}
