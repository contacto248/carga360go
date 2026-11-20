import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { confirmarPoseedor } from "@/lib/qr/handoff";

export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson(request);
  const decision = body.decision === "no_coincide" ? "no_coincide" : body.decision === "entrego" ? "entrego" : null;
  if (!decision) throw new AppError("Indica si entregas la carga.");
  return NextResponse.json(confirmarPoseedor(user, id, decision));
});
