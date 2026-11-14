import { NextResponse } from "next/server";
import { payRoute, readJson } from "@/lib/pagos/http";
import { adminRefund } from "@/lib/pagos/service";

/** { installment: "anticipo" | "saldo", amount?: number } — sin amount = reembolso total de la cuota. */
export const POST = payRoute(["admin"], async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  await adminRefund(user, id, body.installment === "saldo" ? "saldo" : "anticipo", body.amount == null ? null : Number(body.amount));
  return NextResponse.json({ ok: true });
});
