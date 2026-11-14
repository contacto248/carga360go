import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { payRoute, readJson } from "@/lib/pagos/http";
import { cancelByShipper } from "@/lib/pagos/service";

/** El mandante cancela el pago del flete antes de pagar el anticipo. Exige { confirm: true }. */
export const POST = payRoute(["mandante"], async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (body.confirm !== true) throw new AppError("Confirma la cancelación.", 400, "confirmacion_requerida");
  cancelByShipper(user, id, typeof body.note === "string" ? body.note : null);
  return NextResponse.json({ ok: true });
});
