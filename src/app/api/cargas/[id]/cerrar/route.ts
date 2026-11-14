import { NextResponse } from "next/server";
import { guard, requireUser } from "@/lib/api";
import { closeLoad } from "@/lib/offers";

export const POST = guard(async (_request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  closeLoad(user, id);
  return NextResponse.json({ ok: true });
});
