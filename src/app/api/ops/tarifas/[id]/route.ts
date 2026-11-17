import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { procurementGuard } from "@/lib/ops/http";
import { updateRateCard } from "@/lib/ops/procurement";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const PATCH = procurementGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const rateCard = updateRateCard(actor(request), id, await readJson(request), clientIp(request.headers));
  return NextResponse.json({ rateCard });
});
