import { NextResponse } from "next/server";
import { guard, requireUser } from "@/lib/api";
import { reemitirCodigo } from "@/lib/qr/deal";

export const POST = guard(async (_request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await reemitirCodigo(user, id);
  return NextResponse.json({ ok: true });
});
