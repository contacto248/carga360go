import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { latestEta, recalculateEta } from "@/lib/ops/eta";
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
  return NextResponse.json({ eta: latestEta(actor(request), id) }, { headers: { "cache-control": "no-store" } });
});

export const POST = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const eta = await recalculateEta(actor(request), id);
  return NextResponse.json({ eta }, { headers: { "cache-control": "no-store" } });
});
