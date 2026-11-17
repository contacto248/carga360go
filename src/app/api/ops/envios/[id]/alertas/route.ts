import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { listAlerts, saveThresholds } from "@/lib/ops/alerts";
import { opsGuard } from "@/lib/ops/http";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("No encontrado.", 404);
  return user;
}

export const GET = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(listAlerts(actor(request), id), { headers: { "cache-control": "no-store" } });
});

export const PUT = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const thresholds = saveThresholds(actor(request), id, await readJson(request));
  return NextResponse.json({ thresholds }, { headers: { "cache-control": "no-store" } });
});
