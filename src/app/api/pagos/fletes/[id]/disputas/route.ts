import { NextResponse } from "next/server";
import { payRoute, readJson } from "@/lib/pagos/http";
import { openDispute } from "@/lib/pagos/service";

export const POST = payRoute(["mandante", "transportista"], async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  openDispute(user, id, String(body.reason ?? ""), typeof body.comment === "string" ? body.comment : null);
  return NextResponse.json({ ok: true }, { status: 201 });
});
