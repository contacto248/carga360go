import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { payRoute, readJson } from "@/lib/pagos/http";
import { checkout } from "@/lib/pagos/service";
import { rateLimit } from "@/lib/rate-limit";

/** Body: { installment: "anticipo" | "saldo" }. El monto lo calcula el servidor; no se acepta desde el navegador. */
export const POST = payRoute(["mandante"], async (request, user, ctx) => {
  rateLimit(`pagos-checkout:${user.id}`, 20, 60 * 60 * 1000);
  const { id } = await ctx.params;
  const body = await readJson(request);
  const kind = body.installment;
  if (kind !== "anticipo" && kind !== "saldo") throw new AppError("Cuota no válida.", 400, "cuota_invalida");
  return NextResponse.json(await checkout(user, id, kind));
});
