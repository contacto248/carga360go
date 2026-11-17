import { AppError } from "../errors";
import { SessionExpiredError } from "./session";

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  jitterMs?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(error: unknown): boolean {
  if (error instanceof SessionExpiredError) return false;
  if (error instanceof AppError && error.status === 429) return false;
  return true;
}

/** Backoff exponencial: espera `baseDelayMs * 2^intento` entre intentos. El jitter es opcional y por defecto 0. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("withRetry requiere al menos un intento.");
  }
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const sleep = options.sleep ?? defaultSleep;
  const jitterMs = options.jitterMs ?? (() => 0);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1 || !isRetryable(error)) throw error;
      await sleep(baseDelayMs * 2 ** attempt + jitterMs());
    }
  }
  throw lastError instanceof Error ? lastError : new Error("withRetry agotó los intentos.");
}
