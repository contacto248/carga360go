import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { procurementGuard } from "@/lib/ops/http";
import { listVersions } from "@/lib/ops/procurement";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const GET = procurementGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json({ versions: listVersions(actor(request), id) });
});
