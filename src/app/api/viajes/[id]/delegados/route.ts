import { NextResponse } from "next/server";
import { guard, requireUser } from "@/lib/api";
import { crearDelegado } from "@/lib/qr/handoff";

export const POST = guard(async (_request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return NextResponse.json(crearDelegado(user, id));
});
