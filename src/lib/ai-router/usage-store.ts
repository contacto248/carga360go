import { randomUUID } from "crypto";
import { getDb } from "../db";
import type { UsageDraft } from "./orchestrator";

const ERRORS = new Set(["ProviderDisabled", "Timeout", "UpstreamError", "NetworkError", "InvalidResponse"]);

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
        row.errorCode && ERRORS.has(row.errorCode) ? row.errorCode : null,
        stamp,
      );
    }
  });
  write(rows);
}
