import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { listOpsGps } from "@/lib/ops/gps/ingest";
import { opsGuard } from "@/lib/ops/http";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const GET = opsGuard(async (request, ctx) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const { id } = await ctx.params;
  return NextResponse.json(listOpsGps(user, id), { headers: { "cache-control": "no-store" } });
});
