import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { opsGuard } from "@/lib/ops/http";
import { parseRecalculateBody, recalculateScores } from "@/lib/ops/scoring";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

/** Solo un administrador. Con el flag apagado, 404. No es un cron. */
export const POST = opsGuard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  if (user.role !== "admin") throw new AppError("No tienes permiso para esta acción.", 403);
  const result = recalculateScores(parseRecalculateBody(await readJson(request)), user, clientIp(request.headers));
  return NextResponse.json(result);
});
