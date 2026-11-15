import { randomUUID } from "crypto";
import { getDb } from "../db";
import { refreshDiesel } from "./diesel";
import { refreshTollSources } from "./tolls";

/** Job programado: refresca diésel (histórico) y revisa los documentos oficiales de peajes. */
export async function runCostRefresh(trigger: "cron" | "admin" | "test") {
  const started = new Date().toISOString();
  const diesel = await refreshDiesel();
  const tolls = await refreshTollSources();
  const ok = diesel.some((d) => !d.result.startsWith("error") && d.result !== "no conectado");
  const detail = { trigger, diesel, tolls };
  getDb()
    .prepare(`INSERT INTO cost_job_runs (id, job, started_at, finished_at, ok, detail) VALUES (?, 'costos.refresh', ?, ?, ?, ?)`)
    .run(randomUUID(), started, new Date().toISOString(), ok ? 1 : 0, JSON.stringify(detail));
  return { ok, ...detail };
}

export function lastRuns(limit = 20) {
  return getDb().prepare(`SELECT * FROM cost_job_runs ORDER BY started_at DESC LIMIT ?`).all(limit) as {
    id: string;
    job: string;
    started_at: string;
    finished_at: string;
    ok: number;
    detail: string;
  }[];
}
