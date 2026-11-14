import { NextResponse } from "next/server";
import { paymentsEnabled } from "@/lib/pagos/config";
import { cronAuthorized } from "@/lib/pagos/cron";
import { DISABLED_RESPONSE } from "@/lib/pagos/http";
import { closeWindows } from "@/lib/pagos/service";

/** Job interno (cron del servidor). Authorization: Bearer PAYMENTS_CRON_SECRET. */
export async function POST(request: Request) {
  if (!paymentsEnabled()) return DISABLED_RESPONSE();
  if (!cronAuthorized(request.headers)) return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  return NextResponse.json({ liberados: closeWindows() });
}
