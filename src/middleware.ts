import { NextResponse, type NextRequest } from "next/server";
import { documentosPageHidden } from "@/lib/documentos-vencimiento";
import { isEnabled } from "@/lib/ops/flags";
import { opsPageHidden, opsPageRule } from "@/lib/ops/page-gate";
import { userFromHeaders } from "@/lib/request-auth";
import { paginasOpsHidden } from "@/lib/paginas-ops/flag";
import { sistemaPageHidden } from "@/lib/sistema/flag";
import { uiVistaHidden } from "@/lib/vistas/flag";

/**
 * CORS para la API (solo lo necesita Expo web; las apps nativas no envían Origin).
 * `*` sin Allow-Credentials: el navegador nunca adjunta la cookie de sesión en solicitudes
 * de otros orígenes, así que solo funciona con token Bearer y no abre CSRF.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-max-age": "600",
};

const OPS_NOT_FOUND = `<!DOCTYPE html><html lang="es-CL"><head><meta charset="utf-8"><title>Página no encontrada</title><meta name="robots" content="noindex"></head><body><h1>No encontramos esa página</h1></body></html>`;

/** Node: con el flag encendido hay que leer la sesión en SQLite. El edge no puede. */
export const runtime = "nodejs";

function opsNotFound(): NextResponse {
  return new NextResponse(OPS_NOT_FOUND, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api") && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  // loading.tsx ya abrió el HTML en 200 si la página llega a renderizar. El corte es esta respuesta.
  const rule = opsPageRule(pathname);
  if (rule) {
    const user = isEnabled(rule.flag) ? userFromHeaders(request.headers) : null;
    if (opsPageHidden(pathname, user)) return opsNotFound();
  }
  if (sistemaPageHidden(pathname)) return opsNotFound();
  if (paginasOpsHidden(pathname)) return opsNotFound();
  if (uiVistaHidden(pathname)) return opsNotFound();
  if (documentosPageHidden(pathname)) return opsNotFound();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (pathname.startsWith("/api")) {
    for (const [key, value] of Object.entries(CORS)) response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    // Pages, so the root layout can skip GTM/GA4 on /admin. Static assets stay out.
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
