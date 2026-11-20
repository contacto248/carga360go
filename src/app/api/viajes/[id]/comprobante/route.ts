import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getCurrentUser } from "@/lib/current-user";
import { vistaQr } from "@/lib/qr/vista";

export const dynamic = "force-dynamic";

export const GET = guard(async (_request, ctx) => {
  const { id } = await ctx.params;
  const vista = await vistaQr(id, await getCurrentUser());
  return NextResponse.json(vista, { headers: { "cache-control": "no-store" } });
});
