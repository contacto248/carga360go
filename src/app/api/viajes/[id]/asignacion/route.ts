import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { asignarChofer } from "@/lib/qr/assignment";

export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson(request);
  const saved = asignarChofer(user, id, {
    nombre: String(body.nombre ?? ""),
    truckId: String(body.truckId ?? ""),
    patente: body.patente == null ? null : String(body.patente),
    foto: body.foto == null ? null : String(body.foto),
  });
  return NextResponse.json(saved);
});
