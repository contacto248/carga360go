import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { HUMAN_ACTIONS, reviewDocument, type HumanAction } from "@/lib/bassam/acreditacion";
import { vistaCentro } from "@/lib/bassam/centro";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";
import type { PublicUser } from "@/lib/types";

export const dynamic = "force-dynamic";

const INGRESO = "/ingreso?next=/admin/bassam360";

function exigirAdmin(request: Request): PublicUser | Response {
  const user = userFromHeaders(request.headers);
  if (!user) return NextResponse.redirect(new URL(INGRESO, request.url), 303);
  if (user.role !== "admin") throw new AppError("Acceso exclusivo de administración.", 403);
  return user;
}

export const GET = guard(async (request) => {
  const gate = exigirAdmin(request);
  if (gate instanceof Response) return gate;
  return NextResponse.json({ indicadores: vistaCentro() }, { headers: { "cache-control": "no-store" } });
});

export const POST = guard(async (request) => {
  const gate = exigirAdmin(request);
  if (gate instanceof Response) return gate;
  const body = await readJson(request);
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("Documento no válido.");
  const action = body.action;
  if (typeof action !== "string" || !(HUMAN_ACTIONS as readonly string[]).includes(action)) throw new AppError("Acción no válida.");
  return NextResponse.json(reviewDocument(gate, id, action as HumanAction));
});
