import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { opsGuard } from "@/lib/ops/http";
import { linkShipmentToOperation } from "@/lib/ops/shipments";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ operationId: z.string().trim().min(1).max(32) });

export const PUT = opsGuard(async (request, ctx) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("No encontrado.", 404);
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  const shipment = linkShipmentToOperation(user, id, parsed.data.operationId);
  return NextResponse.json({ shipment }, { headers: { "cache-control": "no-store" } });
}, "OPS_INCIDENCIAS_ENABLED");
