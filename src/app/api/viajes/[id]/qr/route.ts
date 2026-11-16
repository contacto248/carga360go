import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { tripQr } from "@/lib/bassam/ops";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const GET = guard(async (request, ctx) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const { id } = await ctx.params;
  const qr = await tripQr(user, id);
  return NextResponse.json(qr, { headers: { "cache-control": "no-store" } });
});
