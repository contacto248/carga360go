import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { docsVencimientoEnabled, evaluateAvisosVencimiento } from "@/lib/documentos-vencimiento";
import { assertAlertJob } from "@/lib/ops/alert-job";

export const dynamic = "force-dynamic";

/**
 * Evaluador de vencimiento. No hay cron en este repo: quien opere lo programa.
 *
 * POST /api/admin/documentos-vencimiento/avisos
 * Authorization: Bearer <OPS_ALERTAS_JOB_SECRET> (24+ caracteres, solo en el entorno).
 * Sin cookie. DOCS_VENCIMIENTO_ENABLED distinto del texto "true": 404.
 * Sin secreto: 503. Secreto incorrecto: 401.
 * Abre o cierra aviso_vencimiento a los 30, 15 y 7 días. No envía correo ni WhatsApp.
 */
export async function POST(request: Request) {
  if (!docsVencimientoEnabled()) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  try {
    assertAlertJob(request.headers);
    return NextResponse.json(evaluateAvisosVencimiento(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
