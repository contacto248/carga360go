import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { listGps, recordGps } from "@/lib/bassam/ops";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const GET = guard(async (request, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(listGps(actor(request), id), { headers: { "cache-control": "no-store" } });
});

export const POST = guard(async (request, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  const point = recordGps(actor(request), id, body.lat, body.lng);
  return NextResponse.json(point, { status: 201, headers: { "cache-control": "no-store" } });
});
