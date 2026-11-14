import { NextResponse } from "next/server";
import { queueAlert } from "@/lib/alerts";
import { guard, readJson } from "@/lib/api";
import { assertCanPublish, assertMarketplaceAccess, redactLoad } from "@/lib/access";
import { auditStrict } from "@/lib/audit";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createLoad, listLoads } from "@/lib/listings";
import { loadFromPayload } from "@/lib/payload";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const GET = guard(async (request) => {
  const viewer = await getCurrentUser();
  assertMarketplaceAccess(viewer);
  const url = new URL(request.url);
  const loads = listLoads({
    equipo: url.searchParams.get("equipo") || "",
    regionOrigen: url.searchParams.get("regionOrigen") || "",
    regionDestino: url.searchParams.get("regionDestino") || "",
    origen: url.searchParams.get("origen") || "",
    destino: url.searchParams.get("destino") || "",
    desde: url.searchParams.get("desde") || "",
    pesoMin: url.searchParams.get("pesoMin") || "",
    q: url.searchParams.get("q") || "",
  });
  return NextResponse.json({ loads: loads.map((item) => redactLoad(item, viewer)) });
});

export const POST = guard(async (request) => {
  // userFromHeaders: misma resolución cookie/Bearer que la sesión web/app (sessionTokenFrom),
  // sin depender del ALS de next/headers — requerido para tests del handler. Permisos: assertCanPublish.
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  assertCanPublish(user);
  rateLimit(`publish:${user.id}`, 30, 60 * 60 * 1000);
  const input = loadFromPayload(await readJson(request));
  const ip = clientIp(request.headers);
  // createLoad + auditStrict en una sola transacción: si el audit falla, la carga se revierte.
  const load = getDb().transaction(() => {
    const created = createLoad(user, input);
    auditStrict(user, "carga.publicada", { type: "carga", id: created.id }, { equipment: created.equipment }, ip);
    return created;
  })();
  queueAlert("carga", load.id);
  return NextResponse.json({ load }, { status: 201 });
});
