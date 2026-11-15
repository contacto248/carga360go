import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { userFromHeaders } from "@/lib/request-auth";
import { advanceTrip, tripView } from "@/lib/viaje";

export const GET = guard(async (request, ctx) => {
  const { id } = await ctx.params;
  // Misma resolución cookie/Bearer que el detalle de la carga. Sin sesión o sin ser parte, viaje es null (no se filtra existencia).
  return NextResponse.json({ viaje: tripView(id, userFromHeaders(request.headers)) });
});

export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson(request);
  const viaje = advanceTrip(user, id, String(body.status ?? ""), body.note == null ? null : String(body.note));
  return NextResponse.json({ viaje });
});
