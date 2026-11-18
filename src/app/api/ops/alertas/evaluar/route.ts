import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { assertAlertJob } from "@/lib/ops/alert-job";
import { evaluateOperationAlerts } from "@/lib/ops/operation-alerts";
import { opsGuard } from "@/lib/ops/http";

export const dynamic = "force-dynamic";

/**
 * Evaluador de incidencias P1. No hay cron en este repo.
 *
 * POST /api/ops/alertas/evaluar
 * Authorization: Bearer <OPS_ALERTAS_JOB_SECRET> (el mismo de /senal). Sin cookie.
 * OPS_FEATURE_ENABLED u OPS_INCIDENCIAS_ENABLED distinto de "true": 404.
 * Sin OPS_ALERTAS_JOB_SECRET: 404. Secreto incorrecto: 401.
 * No abre sin_senal, detencion ni atraso. Esas siguen en ops_alerts.
 */
export const POST = opsGuard(async (request) => {
  const secret = process.env.OPS_ALERTAS_JOB_SECRET?.trim() ?? "";
  if (secret.length < 24) throw new AppError("No encontrado.", 404);
  assertAlertJob(request.headers);
  return NextResponse.json(evaluateOperationAlerts(), { headers: { "cache-control": "no-store" } });
}, "OPS_INCIDENCIAS_ENABLED");
