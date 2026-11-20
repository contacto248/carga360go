import { randomUUID } from "crypto";
import { getDb } from "../db";
import { todayChile } from "../format";
import type { UsageDraft } from "./orchestrator";
import { sanitizeUpstreamCode } from "./providers";

const ERRORS = new Set(["ProviderDisabled", "Timeout", "UpstreamError", "NetworkError", "InvalidResponse"]);

/** OpenAI 403 o UpstreamError guarda el código real. El mensaje y la clave no entran. */
function storedErrorCode(row: UsageDraft): string | null {
  if (row.provider === "openai" && row.errorCode === "UpstreamError") {
    const upstream = sanitizeUpstreamCode(row.upstreamCode);
    if (upstream) return upstream;
  }
  return row.errorCode && ERRORS.has(row.errorCode) ? row.errorCode : null;
}

/** La ruta persiste. El orquestador no abre la base. Sin prompt, sin clave y sin texto del modelo. */
export function persistRouterUsage(traceId: string, userId: string, tenantId: string | null, rows: UsageDraft[], now = new Date()): void {
  if (!rows.length) return;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(traceId)) return;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(userId)) return;
  const tenant = tenantId && /^[A-Za-z0-9_-]{1,80}$/.test(tenantId) ? tenantId : null;
  const stamp = now.toISOString();
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO ai_router_usage (
      id, trace_id, user_id, tenant_id, provider, model, mode,
      input_tokens, output_tokens, cost_usd, latency_ms, fallback_used, result, error_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const write = db.transaction((items: UsageDraft[]) => {
    for (const row of items) {
      const model = /^[A-Za-z0-9._:-]{1,80}$/.test(row.model) ? row.model : "desconocido";
      const tokens = (value: number) => (Number.isInteger(value) && value >= 0 && value <= 10_000_000 ? value : 0);
      const cost = Number.isFinite(row.costUsd) && row.costUsd >= 0 && row.costUsd <= 1_000_000 ? Math.round(row.costUsd * 1e8) / 1e8 : 0;
      const latency = Number.isInteger(row.latencyMs) && row.latencyMs >= 0 && row.latencyMs <= 3_600_000 ? row.latencyMs : 0;
      insert.run(
        randomUUID(),
        traceId,
        userId,
        tenant,
        row.provider,
        model,
        row.mode,
        tokens(row.inputTokens),
        tokens(row.outputTokens),
        cost,
        latency,
        row.fallbackUsed ? 1 : 0,
        row.result,
        storedErrorCode(row),
        stamp,
      );
    }
  });
  write(rows);
}

function chileOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second"));
  return asUtc - instant.getTime();
}

/** Inicio del día civil de Chile, en ISO UTC. */
export function chileDayStartIso(now = new Date()): string {
  const [year, month, date] = todayChile(now).split("-").map(Number);
  const offset = chileOffsetMs(new Date(Date.UTC(year, month - 1, date, 15, 0, 0)));
  return new Date(Date.UTC(year, month - 1, date, 0, 0, 0) - offset).toISOString();
}

/**
 * Gasto ya persistido desde el inicio del día en Chile.
 * Con tenant, suma ese tenant. Sin tenant, solo las filas de ese usuario sin tenant.
 */
export function routerSpendUsd(userId: string, tenantId: string | null, now = new Date()): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total
       FROM ai_router_usage
       WHERE created_at >= ?
         AND (
           (? IS NOT NULL AND tenant_id = ?)
           OR (? IS NULL AND tenant_id IS NULL AND user_id = ?)
         )`,
    )
    .get(chileDayStartIso(now), tenantId, tenantId, tenantId, userId) as { total: number };
  const total = Number(row?.total);
  return Number.isFinite(total) && total > 0 ? total : 0;
}
