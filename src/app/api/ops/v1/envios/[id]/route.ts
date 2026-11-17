import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { apiV1Guard } from "@/lib/ops/http";
import { readShipment } from "@/lib/ops/shipments";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const GET = apiV1Guard(async (request, ctx) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const { id } = await ctx.params;
  return NextResponse.json(readShipment(id, user), { headers: { "cache-control": "no-store" } });
});
