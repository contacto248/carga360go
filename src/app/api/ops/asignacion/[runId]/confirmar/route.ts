import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { confirmAllocation } from "@/lib/ops/allocation";
import { allocationGuard } from "@/lib/ops/http";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

/** Una persona con asignacion.ejecutar confirma. Usa el flujo de ofertas y no escribe la adjudicación por su cuenta. */
export const POST = allocationGuard(async (request, ctx) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const { runId } = await ctx.params;
  const body = await readJson(request);
  const candidateId = typeof body.candidateId === "string" ? body.candidateId : undefined;
  const run = await confirmAllocation(user, runId, candidateId, clientIp(request.headers));
  return NextResponse.json({ run }, { headers: { "cache-control": "no-store" } });
});
