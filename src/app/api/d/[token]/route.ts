import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { delegadoVigente } from "@/lib/qr/handoff";
import { vistaQr } from "@/lib/qr/vista";

export const dynamic = "force-dynamic";

export const GET = guard(async (_request, ctx) => {
  const { token } = await ctx.params;
  const link = delegadoVigente(token);
  if (!link) throw new AppError("El enlace no sirve.", 404);
  const vista = await vistaQr(link.load_id, null, token);
  return NextResponse.json(vista, { headers: { "cache-control": "no-store" } });
});
