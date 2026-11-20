import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { delegadoVigente } from "@/lib/qr/handoff";
import { entregarPdf } from "@/lib/qr/pdf";

export const dynamic = "force-dynamic";

export const GET = guard(async (_request, ctx) => {
  const { token } = await ctx.params;
  const link = delegadoVigente(token);
  if (!link) throw new AppError("El enlace no sirve.", 404);
  const file = entregarPdf(link.load_id);
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store",
    },
  });
});
