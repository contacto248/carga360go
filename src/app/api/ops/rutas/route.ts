import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { procurementGuard } from "@/lib/ops/http";
import { createLane, listLanes } from "@/lib/ops/procurement";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const GET = procurementGuard(async (request) => {
  const orgId = new URL(request.url).searchParams.get("orgId") ?? "";
  if (!orgId) throw new AppError("Falta la organización.");
  return NextResponse.json({ lanes: listLanes(actor(request), orgId) });
});

export const POST = procurementGuard(async (request) => {
  const lane = createLane(actor(request), await readJson(request), clientIp(request.headers));
  return NextResponse.json({ lane }, { status: 201 });
});
