import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getCurrentUser } from "@/lib/current-user";
import { entregarPdf } from "@/lib/qr/pdf";
import { vistaQr } from "@/lib/qr/vista";

export const dynamic = "force-dynamic";

export const GET = guard(async (_request, ctx) => {
  const { id } = await ctx.params;
  await vistaQr(id, await getCurrentUser());
  const file = entregarPdf(id);
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store",
    },
  });
});
