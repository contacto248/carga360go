import { NextResponse } from "next/server";
import { payRoute } from "@/lib/pagos/http";
import { listForUser } from "@/lib/pagos/service";

export const dynamic = "force-dynamic";

export const GET = payRoute(["mandante", "transportista"], async (_request, user) => NextResponse.json({ fletes: listForUser(user) }));
