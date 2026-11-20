import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import { buildComprobantePdf, datosComprobante } from "@/lib/qr/pdf";
import { vistaQr } from "@/lib/qr/vista";

export const dynamic = "force-dynamic";

export const GET = guard(async (_request, ctx) => {
  const { id } = await ctx.params;
  await vistaQr(id, await getCurrentUser());
  const data = datosComprobante(id);
  if (!data) throw new AppError("El comprobante se emite cuando el transportista confirma el trato.", 409);
  const bytes = buildComprobantePdf(data);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${data.folio}.pdf"`,
      "cache-control": "no-store",
    },
  });
});
