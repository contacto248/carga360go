import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { assertMarketplaceAccess, loadForViewer } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { deleteLoad, updateLoad } from "@/lib/listings";
import { loadFromPayload } from "@/lib/payload";
import { userFromHeaders } from "@/lib/request-auth";

export const GET = guard(async (request, ctx) => {
  // userFromHeaders: misma resolución cookie/Bearer que el resto de la API, sin ALS de next/headers (necesario en pruebas).
  const viewer = userFromHeaders(request.headers);
  assertMarketplaceAccess(viewer);
  const { id } = await ctx.params;
  const visible = loadForViewer(id, viewer);
  if (!visible) throw new AppError("Carga no encontrada.", 404);
  return NextResponse.json({ load: visible.load });
});

export const PATCH = guard(async (request, ctx) => {
  const user = await requireUser();
  assertMarketplaceAccess(user);
  const { id } = await ctx.params;
  const load = updateLoad(user, id, loadFromPayload(await readJson(request)));
  return NextResponse.json({ load });
});

export const DELETE = guard(async (_request, ctx) => {
  const user = await requireUser();
  assertMarketplaceAccess(user);
  const { id } = await ctx.params;
  deleteLoad(user, id);
  audit(user, "carga.borrada", { type: "carga", id });
  return NextResponse.json({ ok: true });
});
