import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { getCurrentUser } from "@/lib/current-user";
import { advanceTrip, tripView } from "@/lib/viaje";

export const GET = guard(async (_request, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json({ viaje: tripView(id, await getCurrentUser()) });
});

export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson(request);
  const viaje = advanceTrip(user, id, String(body.status ?? ""), body.note == null ? null : String(body.note));
  return NextResponse.json({ viaje });
});
