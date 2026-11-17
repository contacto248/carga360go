import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { opsGuard } from "@/lib/ops/http";
import { readShipmentVerification } from "@/lib/ops/shipments";
import { userFromHeaders } from "@/lib/request-auth";

export const GET = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("No encontrado.", 404);
  return NextResponse.json(readShipmentVerification(id, user), { headers: { "cache-control": "no-store" } });
});
