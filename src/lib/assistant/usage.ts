import { randomUUID } from "crypto";
import { getDb } from "../db";
import { todayChile } from "../format";
import { getSetting } from "../whatsapp/store";

/** Máximo de intentos de llamada al día. No es un tope en pesos. */
export const DEFAULT_AI_DAILY_CALL_LIMIT = 100;

const ATTEMPT_STATUSES = "('reserved', 'ok', 'error', 'timeout')";

export type SkipReason = "apagada" | "limite";
export type AttemptStatus = "ok" | "error" | "timeout";

export function aiCallsEnabled(): boolean {
  const env = (process.env.AI_CALLS_ENABLED || "").trim().toLowerCase();
  if (env === "false" || env === "0" || env === "off") return false;
  if (env === "true" || env === "1" || env === "on") return true;
  const stored = getSetting("ai_calls_enabled");
  if (stored === "off") return false;
  if (stored === "on") return true;
  return true;
}

export function dailyCallLimit(): number {
  const stored = getSetting("ai_daily_call_limit");
  const raw = stored ?? process.env.AI_DAILY_CALL_LIMIT ?? String(DEFAULT_AI_DAILY_CALL_LIMIT);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return DEFAULT_AI_DAILY_CALL_LIMIT;
  return n;
}

function cleanLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().slice(0, 80) || null;
}

function cleanTokens(value: number | null | undefined): number | null {
  if (value == null || !Number.isInteger(value) || value < 0 || value > 10_000_000) return null;
  return value;
}

/** Reserva un cupo antes de llamar. Las reservas cuentan aunque el proceso se caiga después. */
export function reserveAiCall(now = new Date()): { id: string } | { reason: SkipReason } {
  const db = getDb();
  const day = todayChile(now);
  const stamp = now.toISOString();
  if (!aiCallsEnabled()) {
    db.prepare(
      `INSERT INTO ai_call_log (id, day, status, fallback_reason, created_at, finished_at) VALUES (?, ?, 'skipped', 'apagada', ?, ?)`,
    ).run(randomUUID(), day, stamp, stamp);
    return { reason: "apagada" };
  }
  const limit = dailyCallLimit();
  const take = db.transaction(() => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ai_call_log WHERE day = ? AND status IN ${ATTEMPT_STATUSES}`).get(day) as { n: number };
    if (row.n >= limit) {
      db.prepare(
        `INSERT INTO ai_call_log (id, day, status, fallback_reason, created_at, finished_at) VALUES (?, ?, 'skipped', 'limite', ?, ?)`,
      ).run(randomUUID(), day, stamp, stamp);
      return null;
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO ai_call_log (id, day, status, created_at) VALUES (?, ?, 'reserved', ?)`).run(id, day, stamp);
    return id;
  });
  const id = take.immediate();
  return id ? { id } : { reason: "limite" };
}

export function finishAiCall(
  id: string,
  input: {
    status: AttemptStatus;
    fallbackReason: string | null;
    provider: string | null;
    model: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
  },
  now = new Date(),
) {
  getDb()
    .prepare(
      `UPDATE ai_call_log
       SET status = ?, fallback_reason = ?, provider = ?, model = ?, prompt_tokens = ?, completion_tokens = ?, finished_at = ?
       WHERE id = ? AND status = 'reserved'`,
    )
    .run(
      input.status,
      cleanLabel(input.fallbackReason),
      cleanLabel(input.provider),
      cleanLabel(input.model),
      cleanTokens(input.promptTokens),
      cleanTokens(input.completionTokens),
      now.toISOString(),
      id,
    );
}

export function countAiAttempts(day = todayChile()): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM ai_call_log WHERE day = ? AND status IN ${ATTEMPT_STATUSES}`).get(day) as { n: number };
  return row.n;
}

export type AiCallRow = {
  id: string;
  day: string;
  status: string;
  fallbackReason: string | null;
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

export function listAiCalls(): AiCallRow[] {
  return (
    getDb().prepare(
      `SELECT id, day, status, fallback_reason AS fallbackReason, provider, model, prompt_tokens AS promptTokens, completion_tokens AS completionTokens
       FROM ai_call_log ORDER BY created_at ASC`,
    ).all() as AiCallRow[]
  );
}
