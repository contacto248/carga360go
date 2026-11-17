import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { readAllocationRun } from "@/lib/ops/allocation";
import { apiV1Guard } from "@/lib/ops/http";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const GET = apiV1Guard(async (request, ctx) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const { runId } = await ctx.params;
  return NextResponse.json({ run: readAllocationRun(user, runId) }, { headers: { "cache-control": "no-store" } });
});
