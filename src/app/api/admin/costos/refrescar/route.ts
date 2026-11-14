import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdminHeaders } from "@/lib/costos/api-auth";
import { runCostRefresh } from "@/lib/costos/refresh";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";

/** Refresco manual de fuentes (diésel y peajes) desde el panel. */
export const POST = guard(async (request) => {
  const admin = requireAdminHeaders(request.headers);
  rateLimit(`costos-refresh:${admin.id}`, 6, 60 * 60 * 1000);
  const result = await runCostRefresh("admin");
  audit(admin, "costos.refresco_manual", { type: "costos" }, { ok: result.ok }, clientIp(request.headers));
  return NextResponse.json(result);
});
