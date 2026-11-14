import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { requireAdminHeaders } from "@/lib/costos/api-auth";
import { getQuote, setQuoteStatus } from "@/lib/costos/quotes";
import { AppError } from "@/lib/errors";
import { clientIp } from "@/lib/request-auth";

export const GET = guard(async (request, ctx) => {
  requireAdminHeaders(request.headers);
  const { id } = await ctx.params;
  const row = getQuote(id);
  if (!row) throw new AppError("Cotización no encontrada.", 404);
  return NextResponse.json({ cotizacion: row });
});

/** Revisión: { estado: "revisada" | "enviada" | "descartada" | "borrador", nota? }. Queda auditado. */
export const PATCH = guard(async (request, ctx) => {
  const admin = requireAdminHeaders(request.headers);
  const { id } = await ctx.params;
  const body = await readJson(request);
  const row = setQuoteStatus(admin, id, body.estado, body.nota, clientIp(request.headers));
  return NextResponse.json({ id: row.id, estado: row.status, revisadoPor: row.reviewed_by_email, revisadoEn: row.reviewed_at });
});
