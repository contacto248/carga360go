import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { confirmarPorDelegado, delegadoVigente } from "@/lib/qr/handoff";

export const POST = guard(async (request, ctx) => {
  const { token } = await ctx.params;
  const link = delegadoVigente(token);
  if (!link) throw new AppError("El enlace no sirve.", 404);
  const body = await readJson(request);
  const decision = body.decision === "no_coincide" ? "no_coincide" : body.decision === "entrego" ? "entrego" : null;
  if (!decision) throw new AppError("Indica si entregas la carga.");
  return NextResponse.json(confirmarPorDelegado(token, link.load_id, decision));
});
