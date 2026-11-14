import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { payRoute, readJson } from "@/lib/pagos/http";
import { adminResolve, type Resolution } from "@/lib/pagos/service";

/** { decision: "liberar" | "reembolso_total" | "reembolso_parcial", note, installment?, amount? } */
export const POST = payRoute(["admin"], async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  const decision = body.decision as Resolution;
  if (!["liberar", "reembolso_total", "reembolso_parcial"].includes(decision)) throw new AppError("Decisión no válida.", 400, "decision_invalida");
  const kind = body.installment === "saldo" ? "saldo" : "anticipo";
  const amount = body.amount == null ? null : Number(body.amount);
  await adminResolve(user, id, decision, String(body.note ?? ""), decision === "liberar" ? undefined : { kind, amount });
  return NextResponse.json({ ok: true });
});
