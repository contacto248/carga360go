import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createOrganization, listOrganizations } from "@/lib/ops/organizations";
import { opsGuard } from "@/lib/ops/http";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const GET = opsGuard(async (request) => {
  const organizations = listOrganizations(actor(request));
  return NextResponse.json({ organizations });
});

export const POST = opsGuard(async (request) => {
  const organization = createOrganization(actor(request), await readJson(request), clientIp(request.headers));
  return NextResponse.json({ organization }, { status: 201 });
});
