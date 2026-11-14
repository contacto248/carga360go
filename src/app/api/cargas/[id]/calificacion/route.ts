import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { rateLoad } from "@/lib/viaje";

export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson(request);
  const viaje = rateLoad(user, id, Number(body.stars), body.comment == null ? null : String(body.comment));
  return NextResponse.json({ viaje });
});
