import { NextResponse } from "next/server";
import { payRoute } from "@/lib/pagos/http";
import { accountView } from "@/lib/pagos/service";

export const dynamic = "force-dynamic";

/** Estado de la vinculación con Mercado Pago, sin tokens. */
export const GET = payRoute(["transportista"], async (_request, user) => NextResponse.json({ cuenta: accountView(user.id) }));
