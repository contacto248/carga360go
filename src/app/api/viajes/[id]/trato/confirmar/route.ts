import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { confirmarTrato } from "@/lib/qr/deal";
import { archivarComprobante } from "@/lib/qr/pdf";

export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson(request);
  const trato = confirmarTrato(user, id, String(body.codigo ?? ""));
  archivarComprobante(id);
  return NextResponse.json(trato);
});
