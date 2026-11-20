import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { fotoChofer } from "@/lib/qr/assignment";
import { delegadoVigente } from "@/lib/qr/handoff";

export const dynamic = "force-dynamic";

export const GET = guard(async (_request, ctx) => {
  const { token } = await ctx.params;
  const link = delegadoVigente(token);
  if (!link) throw new AppError("El enlace no sirve.", 404);
  const file = fotoChofer(link.load_id);
  if (!file) throw new AppError("Este chofer no tiene foto.", 404);
  return new NextResponse(new Uint8Array(readFileSync(file.path)), {
    headers: { "content-type": file.mime, "cache-control": "private, no-store" },
  });
});
