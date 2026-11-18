import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { opsGuard } from "@/lib/ops/http";
import { closeAlert, listOperationAlerts, registerManualIncident } from "@/lib/ops/operation-alerts";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("No encontrado.", 404);
  return user;
}

export const GET = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const operationId = new URL(request.url).searchParams.get("operationId") ?? undefined;
  return NextResponse.json(listOperationAlerts(actor(request), { shipmentId: id, operationId }), {
    headers: { "cache-control": "no-store" },
  });
}, "OPS_INCIDENCIAS_ENABLED");

export const POST = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(registerManualIncident(actor(request), id, await readJson(request)), {
    headers: { "cache-control": "no-store" },
  });
}, "OPS_INCIDENCIAS_ENABLED");

export const PATCH = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(closeAlert(actor(request), id, await readJson(request)), {
    headers: { "cache-control": "no-store" },
  });
}, "OPS_INCIDENCIAS_ENABLED");
