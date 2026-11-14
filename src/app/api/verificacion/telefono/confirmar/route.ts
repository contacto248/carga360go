import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { confirmPhoneCode } from "@/lib/verification";

export const POST = guard(async (request) => {
  const user = await requireUser();
  const body = await readJson(request);
  confirmPhoneCode(user, String(body.code ?? ""));
  return NextResponse.json({ ok: true });
});
