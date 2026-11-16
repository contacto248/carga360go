import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    // CSP razonable: todo propio; Next necesita scripts y estilos en línea.
    // GTM (GTM-NP2F9GRJ) y GA4 (G-1LWRQYDEKS): script, imagen, connect y el iframe noscript.
    // *.google-analytics.com cubre region1.google-analytics.com y el resto de region*.
    // HubSpot tracking (js.hs-scripts.com/{portalId}.js) solo tras consentimiento de cookies.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://js.hs-scripts.com https://js.hscollectedforms.net https://js.hubspot.com https://js.hs-analytics.net https://js.hs-banner.com https://js.hsadspixel.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://stats.g.doubleclick.net https://track.hubspot.com https://forms.hsforms.com https://*.hubspot.com",
      "font-src 'self' data:",
      "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://stats.g.doubleclick.net https://api.hubspot.com https://forms.hubspot.com https://api.hsforms.com https://cta-service-cms2.hubspot.com https://*.hubspot.com https://*.hs-analytics.net https://*.hscollectedforms.net",
      "frame-src 'self' blob: https://www.googletagmanager.com https://app.hubspot.com https://*.hubspot.com https://*.hsforms.com",
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
      // T-062: singular → hub de guías (marketing apunta a /guias/).
      { source: "/guia", destination: "/guias", permanent: false },
      // T-066 auditoría E2E: alias públicos esperados (nunca 404).
      // /faq tiene página propia (el fragmento #faq no viaja en redirects HTTP).
      { source: "/empresas", destination: "/registro", permanent: false },
      { source: "/seguimiento", destination: "/tecnologia", permanent: false },
      { source: "/login", destination: "/ingreso", permanent: false },
      { source: "/ayuda", destination: "/guias", permanent: false },
    ];
  },
};

export default nextConfig;
