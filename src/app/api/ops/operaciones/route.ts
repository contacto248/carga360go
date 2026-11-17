import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createOperacion } from "@/lib/ops/operacion";
import { operacionGuard } from "@/lib/ops/http";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const POST = operacionGuard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const result = createOperacion(user, await readJson(request), clientIp(request.headers));
  return NextResponse.json(result, {
    status: result.replayed ? 200 : 201,
    headers: { "cache-control": "no-store" },
  });
});
