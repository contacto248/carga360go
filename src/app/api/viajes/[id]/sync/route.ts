import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { validarRetiro } from "@/lib/qr/handoff";

export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson(request);
  const saved = validarRetiro(user, id, {
    codigo: body.codigo == null ? null : String(body.codigo),
    patente: body.patente == null ? null : String(body.patente),
    deviceId: body.deviceId == null ? null : String(body.deviceId),
    deviceTime: body.deviceTime == null ? null : String(body.deviceTime),
    sinSenal: true,
  });
  return NextResponse.json(saved);
});
