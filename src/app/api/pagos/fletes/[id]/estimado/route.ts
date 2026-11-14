import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { payRoute } from "@/lib/pagos/http";
import { estimateFor } from "@/lib/pagos/service";

export const dynamic = "force-dynamic";

export const GET = payRoute(["mandante", "admin"], async (request, user, ctx) => {
  const { id } = await ctx.params;
  const kind = new URL(request.url).searchParams.get("installment") ?? "anticipo";
  if (kind !== "anticipo" && kind !== "saldo") throw new AppError("Cuota no válida.", 400, "cuota_invalida");
  return NextResponse.json({ estimado: estimateFor(user, id, kind) });
});
