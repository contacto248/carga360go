import { NextResponse } from "next/server";
import { setAlertsEnabled } from "@/lib/alerts";
import { guard, readJson, requireUser } from "@/lib/api";

export const POST = guard(async (request) => {
  const user = await requireUser();
  const body = await readJson(request);
  setAlertsEnabled(user.id, body.enabled === true);
  return NextResponse.json({ enabled: body.enabled === true });
});
