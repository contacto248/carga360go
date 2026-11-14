import { AppError } from "./errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

/** Límite en memoria (un solo proceso Next en producción). Lanza 429 al superar `limit` en `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const minutes = Math.max(1, Math.ceil((bucket.resetAt - now) / 60_000));
    throw new AppError(`Demasiados intentos. Espera ${minutes} min e inténtalo de nuevo.`, 429);
  }
}

export const LOGIN_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
export const REGISTER_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

export function resetRateLimits() {
  buckets.clear();
}
