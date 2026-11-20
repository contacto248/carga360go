import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { validarRetiro, type ValidarInput } from "@/lib/qr/handoff";

function inputOf(body: Record<string, unknown>): ValidarInput {
  return {
    token: body.token == null ? null : String(body.token),
    codigo: body.codigo == null ? null : String(body.codigo),
    patente: body.patente == null ? null : String(body.patente),
    lat: typeof body.lat === "number" ? body.lat : null,
    lng: typeof body.lng === "number" ? body.lng : null,
    deviceId: body.deviceId == null ? null : String(body.deviceId),
    sinSenal: body.sinSenal === true,
    deviceTime: body.deviceTime == null ? null : String(body.deviceTime),
  };
}

export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const saved = validarRetiro(user, id, inputOf(await readJson(request)));
  return NextResponse.json(saved);
});
