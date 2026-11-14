import { NextResponse } from "next/server";
import { payRoute } from "@/lib/pagos/http";
import { markInTransit } from "@/lib/pagos/service";

export const POST = payRoute(["transportista"], async (_request, user, ctx) => {
  const { id } = await ctx.params;
  markInTransit(user, id);
  return NextResponse.json({ ok: true });
});
