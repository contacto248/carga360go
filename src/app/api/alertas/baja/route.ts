import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/alerts";
import { guard, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const POST = guard(async (request) => {
  const body = await readJson(request);
  if (!unsubscribeByToken(String(body.t || ""))) throw new AppError("El enlace no es válido o ya no existe.", 404);
  return NextResponse.json({ ok: true });
});
