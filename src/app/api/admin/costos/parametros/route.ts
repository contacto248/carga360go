import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { requireAdminHeaders } from "@/lib/costos/api-auth";
import { getParams, saveParams } from "@/lib/costos/params";
import { AppError } from "@/lib/errors";
import { clientIp } from "@/lib/request-auth";

export const GET = guard(async (request) => {
  requireAdminHeaders(request.headers);
  return NextResponse.json({ parametros: getParams() });
});

/** Cambia parámetros: { cambios: { "margenPct": 5, "vehiculo.camion_2_ejes.rendCargadoKmL": 4 } }. Cada cambio queda auditado. */
export const PUT = guard(async (request) => {
  const admin = requireAdminHeaders(request.headers);
  const body = await readJson(request);
  const cambios = body.cambios;
  if (!cambios || typeof cambios !== "object" || Array.isArray(cambios)) throw new AppError("Faltan los cambios.");
  const result = saveParams(admin, cambios as Record<string, unknown>, clientIp(request.headers));
  return NextResponse.json({ ...result, parametros: getParams() });
});
