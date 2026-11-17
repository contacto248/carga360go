import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { ingestDriverFix } from "@/lib/ops/gps/ingest";
import { opsGuard } from "@/lib/ops/http";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

/** Punto enviado por la app o la web del conductor. 404 con OPS_FEATURE_ENABLED apagado. */
export const POST = opsGuard(async (request) => {
  const user = actor(request);
  const body = await readJson(request);
  const loadId = typeof body.loadId === "string" ? body.loadId : "";
  if (!loadId) throw new AppError("Falta la carga.");
  const result = ingestDriverFix(user, loadId, body.lat, body.lng);
  return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
});
