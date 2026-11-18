import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { gestionSnapshot } from "@/lib/gestion/metrics";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const GET = guard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  if (user.role !== "admin") throw new AppError("No tienes permiso para esta acción.", 403);
  return NextResponse.json({ gestion: gestionSnapshot() });
});

