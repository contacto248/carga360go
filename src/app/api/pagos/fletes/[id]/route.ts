import { NextResponse } from "next/server";
import { payRoute } from "@/lib/pagos/http";
import { detailForUser } from "@/lib/pagos/service";

export const dynamic = "force-dynamic";

export const GET = payRoute("any", async (_request, user, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json({ flete: detailForUser(user, id) });
});
