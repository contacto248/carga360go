import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { evaluateLatest } from "@/lib/ops/eta";
import { opsGuard } from "@/lib/ops/http";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const GET = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("No encontrado.", 404);
  return NextResponse.json(evaluateLatest(user, id), { headers: { "cache-control": "no-store" } });
});
