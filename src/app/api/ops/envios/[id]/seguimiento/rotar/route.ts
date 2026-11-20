import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { opsGuard } from "@/lib/ops/http";
import { rotateTrackingLink } from "@/lib/ops/tracking";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const POST = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("No encontrado.", 404);
  const link = rotateTrackingLink(user, id);
  return NextResponse.json(link, { status: 201, headers: { "cache-control": "no-store" } });
});
