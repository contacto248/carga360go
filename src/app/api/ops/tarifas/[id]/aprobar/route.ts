import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { procurementGuard } from "@/lib/ops/http";
import { approveRateCard } from "@/lib/ops/procurement";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const POST = procurementGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const rateCard = approveRateCard(actor(request), id, clientIp(request.headers));
  return NextResponse.json({ rateCard });
});
