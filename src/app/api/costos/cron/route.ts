import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { assertCron } from "@/lib/costos/api-auth";
import { runCostRefresh } from "@/lib/costos/refresh";

/**
 * Endpoint para el cron del servidor (ej. cada 6 horas). El job de producción
 * es deploy/costos-jobs.sh: el secreto se lee de .env y se pasa a curl por un
 * archivo temporal (modo 600), no por la línea de comandos.
 * Refresca el diésel (histórico) y revisa los documentos oficiales de peajes.
 */
export const POST = guard(async (request) => {
  assertCron(request.headers);
  return NextResponse.json(await runCostRefresh("cron"));
});
