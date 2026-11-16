import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    // CSP razonable: todo propio; Next necesita scripts y estilos en línea.
    // GTM (GTM-NP2F9GRJ) y GA4 (G-1LWRQYDEKS): script, imagen, connect y el iframe noscript.
    // *.google-analytics.com cubre region1.google-analytics.com y el resto de region*.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://stats.g.doubleclick.net",
      "font-src 'self' data:",
      "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://stats.g.doubleclick.net",
      "frame-src 'self' blob: https://www.googletagmanager.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        // nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy y HSTS los agrega nginx.
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/publicar", destination: "/cargas/nueva", permanent: false },
      { source: "/publicar-camion", destination: "/camiones/nuevo", permanent: false },
      // T-047 / T-049: rutas pedidas por el sitio público; nunca 404.
      { source: "/cotizador", destination: "/herramientas/calculadora", permanent: false },
      { source: "/cargas-de-retorno", destination: "/cargas-de-retorno-mineras", permanent: false },
    ];
  },
};

export default nextConfig;
