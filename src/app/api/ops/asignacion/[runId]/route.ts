import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { getAllocationRun } from "@/lib/ops/allocation";
import { allocationGuard } from "@/lib/ops/http";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const GET = allocationGuard(async (request, ctx) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const { runId } = await ctx.params;
  return NextResponse.json({ run: getAllocationRun(user, runId) }, { headers: { "cache-control": "no-store" } });
});
