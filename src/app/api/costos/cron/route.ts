import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { assertCron } from "@/lib/costos/api-auth";
import { runCostRefresh } from "@/lib/costos/refresh";

/**
 * Endpoint para el cron del servidor (ej. cada 6 horas):
 *   curl -X POST -H "Authorization: Bearer $COSTOS_CRON_SECRET" https://carga360go.cl/api/costos/cron
 * Refresca el diésel (histórico) y revisa los documentos oficiales de peajes.
 */
export const POST = guard(async (request) => {
  assertCron(request.headers);
  return NextResponse.json(await runCostRefresh("cron"));
});
