import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { responderAgente } from "@/lib/bassam/agente-respuesta";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const POST = guard(async (request) => {
  const body = await readJson(request);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) throw new AppError("Escriba su consulta.");
  const rol = body.rol === "transportista" || body.rol === "mandante" ? body.rol : null;
  const user = userFromHeaders(request.headers);
  return NextResponse.json({ reply: responderAgente(message, user?.role === "admin", rol) }, { headers: { "cache-control": "no-store" } });
});
