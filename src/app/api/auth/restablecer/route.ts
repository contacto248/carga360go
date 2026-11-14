import { NextResponse } from "next/server";
import { resetPassword } from "@/lib/auth";
import { guard, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";

export const POST = guard(async (request) => {
  rateLimit(`reset:${clientIp(request.headers)}`, 10, 60 * 60 * 1000);
  const body = await readJson(request);
  resetPassword(String(body.token ?? ""), String(body.password ?? ""));
  return NextResponse.json({ ok: true });
});
