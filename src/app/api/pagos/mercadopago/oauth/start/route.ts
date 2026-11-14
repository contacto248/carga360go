import { NextResponse } from "next/server";
import { payRoute } from "@/lib/pagos/http";
import { authorizeUrl } from "@/lib/pagos/mp-client";
import { createOAuthState } from "@/lib/pagos/service";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Redirige al transportista a la autorización de Mercado Pago con un `state` de un solo uso. */
export const GET = payRoute(["transportista"], async (_request, user) => {
  rateLimit(`pagos-oauth:${user.id}`, 10, 60 * 60 * 1000);
  const url = authorizeUrl(createOAuthState(user));
  return NextResponse.redirect(url, 302);
});
