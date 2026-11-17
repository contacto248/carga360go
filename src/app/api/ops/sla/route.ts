import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { procurementGuard } from "@/lib/ops/http";
import { createSla, listSlas } from "@/lib/ops/procurement";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const GET = procurementGuard(async (request) => {
  const contractId = new URL(request.url).searchParams.get("contractId") ?? "";
  if (!contractId) throw new AppError("Falta el contrato.");
  return NextResponse.json({ slas: listSlas(actor(request), contractId) });
});

export const POST = procurementGuard(async (request) => {
  const sla = createSla(actor(request), await readJson(request), clientIp(request.headers));
  return NextResponse.json({ sla }, { status: 201 });
});
