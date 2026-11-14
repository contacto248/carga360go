import { NextResponse } from "next/server";
import { payRoute, readJson } from "@/lib/pagos/http";
import { adminCancel } from "@/lib/pagos/service";

export const POST = payRoute(["admin"], async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  adminCancel(user, id, String(body.note ?? ""));
  return NextResponse.json({ ok: true });
});
