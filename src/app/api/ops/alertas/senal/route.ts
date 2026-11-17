import { NextResponse } from "next/server";
import { assertAlertJob } from "@/lib/ops/alert-job";
import { evaluateSilentSignals } from "@/lib/ops/alerts";
import { opsGuard } from "@/lib/ops/http";

export const dynamic = "force-dynamic";

/**
 * Evaluador de sin_senal. No hay cron en este repo: quien opere lo programa.
 *
 * POST /api/ops/alertas/senal
 * Authorization: Bearer <OPS_ALERTAS_JOB_SECRET> (24+ caracteres, solo en el entorno).
 * Sin cookie. Ejemplo: curl -sS -X POST -H "Authorization: Bearer $OPS_ALERTAS_JOB_SECRET" https://<host>/api/ops/alertas/senal
 * OPS_FEATURE_ENABLED distinto del texto "true": 404. Sin secreto: 503. Secreto incorrecto: 401.
 * Recorre envíos que ya tienen GPS y abre o cierra sin_senal según el umbral
 * (OPS_ALERTA_SIN_SENAL_MIN, default 45 minutos; el plan de QA anota 20).
 * No abre detención ni atraso, y no muestra nada al cliente del enlace público.
 */
export const POST = opsGuard(async (request) => {
  assertAlertJob(request.headers);
  return NextResponse.json(evaluateSilentSignals(), { headers: { "cache-control": "no-store" } });
});
