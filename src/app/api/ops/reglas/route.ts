import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createRule, listRules } from "@/lib/ops/allocation";
import { allocationGuard } from "@/lib/ops/http";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const GET = allocationGuard(async (request) => {
  const user = actor(request);
  const orgId = new URL(request.url).searchParams.get("orgId");
  return NextResponse.json({ rules: listRules(user, orgId) }, { headers: { "cache-control": "no-store" } });
});

export const POST = allocationGuard(async (request) => {
  const user = actor(request);
  const rule = createRule(user, await readJson(request), clientIp(request.headers));
  return NextResponse.json({ rule }, { status: 201, headers: { "cache-control": "no-store" } });
});
