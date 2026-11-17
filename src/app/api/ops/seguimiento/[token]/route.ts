import { NextResponse } from "next/server";
import { opsGuard } from "@/lib/ops/http";
import { readTracking } from "@/lib/ops/tracking";

export const dynamic = "force-dynamic";

/** Público con el token. 404 si el flag maestro está apagado o el token no existe. */
export const GET = opsGuard(async (_request, ctx) => {
  const { token } = await ctx.params;
  return NextResponse.json(readTracking(token), { headers: { "cache-control": "no-store" } });
});
