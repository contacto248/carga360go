import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { approveByManager } from "@/lib/bassam/quality";
import { bassamSnapshot, decideAuthorization, parseAuthAction } from "@/lib/bassam/ops";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function adminOf(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  if (user.role !== "admin") throw new AppError("Acceso exclusivo de administración.", 403);
  return user;
}

export const GET = guard(async (request) => {
  const data = bassamSnapshot(adminOf(request));
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
});

export const POST = guard(async (request) => {
  const user = adminOf(request);
  const body = await readJson(request);
  const loadId = typeof body.loadId === "string" ? body.loadId : "";
  if (!/^[0-9a-f-]{36}$/i.test(loadId)) throw new AppError("Viaje no válido.");
  if (body.action === "aprobado") return NextResponse.json(approveByManager(user, loadId));
  const result = decideAuthorization(user, loadId, parseAuthAction(body.action), body.note == null ? null : String(body.note));
  return NextResponse.json(result);
});
