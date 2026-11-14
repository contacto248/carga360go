import { NextResponse } from "next/server";
import { guard, readJson, requireRoles } from "@/lib/api";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request-auth";
import { getSettings, saveSettings } from "@/lib/settings";

export const GET = guard(async () => {
  await requireRoles(["admin"]);
  return NextResponse.json({ settings: getSettings() });
});

export const PATCH = guard(async (request) => {
  const admin = await requireRoles(["admin"]);
  const body = await readJson(request);
  const settings = saveSettings({ offerHours: body.offerHours, allowImprove: body.allowImprove, showSuggestedPrice: body.showSuggestedPrice });
  audit(admin, "ajustes.editados", { type: "ajustes" }, settings, clientIp(request.headers));
  return NextResponse.json({ settings });
});
