import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { userFromHeaders } from "@/lib/request-auth";
import { assertControlAdmin, saveControlRecord } from "@/lib/control/store";
import { controlSnapshot } from "@/lib/control/snapshot";

export const dynamic = "force-dynamic";
export const GET = guard(async request => {
  const user = userFromHeaders(request.headers);
  assertControlAdmin(user);
  const url = new URL(request.url);
  const snapshot = controlSnapshot(user, url.searchParams.get("company"));
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (url.searchParams.get("export") === "1") headers["Content-Disposition"] = `attachment; filename="bassam360-${snapshot.company}.json"`;
  return NextResponse.json(snapshot, { headers });
});
async function save(request: Request, update: boolean) {
  const user = userFromHeaders(request.headers);
  assertControlAdmin(user);
  const body = await readJson(request);
  if (update && (typeof body.id !== "string" || !body.id)) return NextResponse.json({ error: "Falta el registro." }, { status: 400 });
  const result = saveControlRecord(user, body.company, String(body.kind), body, update ? body.id as string : undefined);
  return NextResponse.json(result, { status: update ? 200 : 201, headers: { "Cache-Control": "no-store" } });
}
export const POST = guard(request => save(request, false));
export const PATCH = guard(request => save(request, true));
