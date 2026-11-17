import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { apiV1Guard } from "@/lib/ops/http";
import { listContractsV1, optionalOrgId } from "@/lib/ops/v1";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const GET = apiV1Guard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return NextResponse.json({ contracts: listContractsV1(user, optionalOrgId(request)) }, { headers: { "cache-control": "no-store" } });
});
