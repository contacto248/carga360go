import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { parseFreightPatch, publicFreightParams, readFreightConfig, recentFreightAudit, updateFreightConfig } from "@/lib/freight-cost";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

function requireAdmin(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  if (user.role !== "admin") throw new AppError("No tienes permiso para esta acción.", 403);
  return user;
}

export const GET = guard(async (request) => {
  requireAdmin(request);
  return NextResponse.json({ parametros: publicFreightParams(readFreightConfig()), auditoria: recentFreightAudit(30) });
});

export const PATCH = guard(async (request) => {
  const admin = requireAdmin(request);
  const patch = parseFreightPatch(await readJson(request));
  const parametros = publicFreightParams(updateFreightConfig(admin, patch));
  audit(admin, "parametro_flete.editado", { type: "parametro_flete" }, parametros, clientIp(request.headers));
  return NextResponse.json({ parametros });
});
