import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { procurementGuard } from "@/lib/ops/http";
import { importRateCard } from "@/lib/ops/procurement";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const POST = procurementGuard(async (request) => {
  const result = importRateCard(actor(request), await readJson(request), clientIp(request.headers));
  if ("errors" in result) return NextResponse.json({ errors: result.errors }, { status: 422 });
  return NextResponse.json({ rateCard: result.rateCard }, { status: 201 });
});
