import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { HUMAN_ACTIONS, reviewDocument, type HumanAction } from "@/lib/bassam/acreditacion";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const POST = guard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const body = await readJson(request);
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("Documento no válido.");
  const action = body.action;
  if (typeof action !== "string" || !(HUMAN_ACTIONS as readonly string[]).includes(action)) throw new AppError("Acción no válida.");
  return NextResponse.json(reviewDocument(user, id, action as HumanAction));
});
