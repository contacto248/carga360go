import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { opsGuard } from "@/lib/ops/http";
import { assertCanViewScores, listScores } from "@/lib/ops/scoring";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

/** Puntaje privado: admin, o mandante con desempeno.ver. Con el flag apagado, 404. */
export const GET = opsGuard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const url = new URL(request.url);
  assertCanViewScores(user, url.searchParams.get("orgId"));
  const carrierUserId = url.searchParams.get("carrierUserId")?.trim() || undefined;
  return NextResponse.json({ scores: listScores(carrierUserId) });
});
