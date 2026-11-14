import { NextResponse, type NextRequest } from "next/server";

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

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api") && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

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
