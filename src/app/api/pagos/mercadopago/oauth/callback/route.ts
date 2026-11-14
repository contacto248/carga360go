import { NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/pagos/config";
import { DISABLED_RESPONSE } from "@/lib/pagos/http";
import { exchangeCode } from "@/lib/pagos/mp-client";
import { consumeOAuthState, saveOAuthTokens } from "@/lib/pagos/service";
import { paymentsEnabled } from "@/lib/pagos/config";
import { audit } from "@/lib/audit";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function back(query: string) {
  return NextResponse.redirect(`${publicBaseUrl()}/panel/pagos?${query}`, 302);
}

/**
 * Redirect URL registrada en la app Marketplace (MP_OAUTH_REDIRECT_URI).
 * Valida `state` (un solo uso, mismo usuario de la sesión) antes de llamar a la API.
 * Los tokens se guardan cifrados y nunca vuelven al navegador.
 */
export async function GET(request: Request) {
  if (!paymentsEnabled()) return DISABLED_RESPONSE();
  const params = new URL(request.url).searchParams;
  const user = userFromHeaders(request.headers);
  const state = params.get("state");
  if (params.get("error")) return back("error=mp_cancelado");
  if (!user || user.role !== "transportista") return back("error=sesion");
  if (!consumeOAuthState(state, user.id)) {
    audit(user, "pago.oauth_state_invalido", { type: "usuario", id: user.id });
    return back("error=state");
  }
  const code = params.get("code");
  if (!code || code.length > 300) return back("error=sin_codigo");
  try {
    const tokens = await exchangeCode(code, state!);
    saveOAuthTokens(user.id, tokens);
    audit(user, "pago.cuenta_conectada", { type: "usuario", id: user.id });
    return back("conectado=1");
  } catch {
    return back("error=intercambio");
  }
}
