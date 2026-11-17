import { rateLimit } from "../rate-limit";

/** Tope de la rutina: 30 lecturas por clave cada 10 minutos, en este proceso. */
export const AUTOMATION_RATE = { limit: 30, windowMs: 10 * 60 * 1000 };

export function guardAutomationRate(
  key: string,
  limit = AUTOMATION_RATE.limit,
  windowMs = AUTOMATION_RATE.windowMs,
): void {
  const id = key.trim();
  if (!id) throw new Error("La clave de rate limit no puede ir vacía.");
  rateLimit(`web-automation:${id}`, limit, windowMs);
}
