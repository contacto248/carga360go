import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { listAllocationRuns, proposeAllocation } from "@/lib/ops/allocation";
import { allocationGuard } from "@/lib/ops/http";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

/** Propuestas de asignación. Con el flag apagado, 404. */
export const GET = allocationGuard(async (request) => {
  const user = actor(request);
  const shipmentId = new URL(request.url).searchParams.get("shipmentId");
  return NextResponse.json({ runs: listAllocationRuns(user, shipmentId) }, { headers: { "cache-control": "no-store" } });
});

/** Arma una propuesta. No adjudica: dry_run queda en 1. */
export const POST = allocationGuard(async (request) => {
  const user = actor(request);
  const run = proposeAllocation(user, await readJson(request), clientIp(request.headers));
  return NextResponse.json({ run }, { status: 201, headers: { "cache-control": "no-store" } });
});
