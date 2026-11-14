import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { clearSessionCookie } from "@/lib/current-user";

export const POST = guard(async () => {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
