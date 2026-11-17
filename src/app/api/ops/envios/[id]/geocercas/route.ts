import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { listGeofences, saveGeofence } from "@/lib/ops/eta";
import { opsGuard } from "@/lib/ops/http";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("No encontrado.", 404);
  return user;
}

export const GET = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json({ geofences: listGeofences(actor(request), id) }, { headers: { "cache-control": "no-store" } });
});

export const POST = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const saved = saveGeofence(actor(request), id, await readJson(request));
  return NextResponse.json(saved, { status: saved.created ? 201 : 200, headers: { "cache-control": "no-store" } });
});
