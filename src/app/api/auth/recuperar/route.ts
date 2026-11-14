import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth";
import { guard, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";

export const POST = guard(async (request) => {
  rateLimit(`recover:${clientIp(request.headers)}`, 5, 60 * 60 * 1000);
  const body = await readJson(request);
  rateLimit(`recover-mail:${String(body.email ?? "").trim().toLowerCase()}`, 3, 60 * 60 * 1000);
  const result = await requestPasswordReset(String(body.email ?? ""));
  return NextResponse.json(result);
});
