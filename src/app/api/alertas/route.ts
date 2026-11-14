import { NextResponse } from "next/server";
import { assertMarketplaceAccess } from "@/lib/access";
import { listSavedSearches, saveSearch } from "@/lib/alerts";
import { guard, readJson, requireUser } from "@/lib/api";

export const GET = guard(async () => {
  const user = await requireUser();
  return NextResponse.json({ alerts: listSavedSearches(user.id) });
});

export const POST = guard(async (request) => {
  const user = await requireUser();
  assertMarketplaceAccess(user);
  const body = await readJson(request);
  const filters = body.filters && typeof body.filters === "object" && !Array.isArray(body.filters) ? (body.filters as Record<string, unknown>) : {};
  const alert = saveSearch(user, String(body.kind || ""), filters);
  return NextResponse.json({ alert }, { status: 201 });
});
