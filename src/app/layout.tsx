import type { Metadata, Viewport } from "next";
import { Figtree, Sora } from "next/font/google";
import { headers } from "next/headers";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HubSpotTracking } from "@/components/HubSpotTracking";
import { PolicyBody, TermsBody } from "@/components/PolicyBody";
import { PrivacyGate } from "@/components/PrivacyGate";
import { privacyGateFor } from "@/lib/accreditation";
import { getCurrentUser } from "@/lib/current-user";
import { hubspotPortalId } from "@/lib/hubspot";
import { privacyVersion, termsVersion } from "@/lib/privacy";
import { BRAND } from "@/lib/catalog";
import "./tokens.css";
import "./globals.css";

const display = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["600", "700", "800"],
});

const bodyFont = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const dynamic = "force-dynamic";

const PRODUCTION_ANALYTICS_HOSTS = new Set(["www.carga360go.cl", "carga360go.cl"]);

const title = "Carga360go — Trazabilidad y automatización de cargas y camiones en Chile";
const description =
  `Carga360go conecta cargas y camiones en Chile con trazabilidad y automatización. Publica tu carga, encuentra camión, sigue la operación en vivo y conserva el comprobante digital. Costo de referencia desglosado del flete: ruta, peajes según ejes, diésel y costos operacionales. ${BRAND.company} · RUT ${BRAND.rut}.`;

export const metadata: Metadata = {
  metadataBase: new URL("https://www.carga360go.cl"),
  title: { default: title, template: "%s | Carga360go" },
  description,
  keywords: [
    "transporte de carga Chile",
    "fletes",
    "carga de retorno",
    "transportistas",
    "carga masiva",
    "carga general",
    "camiones disponibles",
    "Arica a Punta Arenas",
    "transporte minero Chile",
    "cama baja",
    "cargas de retorno",
  ],
  applicationName: "Carga360go",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title,
    description,
    locale: "es_CL",
    type: "website",
    siteName: "Carga360go",
    images: [
      {
        url: "https://www.carga360go.cl/og.jpg",
        width: 1200,
        height: 630,
        alt: "Carga360go — Cargas y camiones en todo Chile",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["https://www.carga360go.cl/og.jpg"],
  },
  robots: { index: true, follow: true },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#0B1633",
};

function hostnameFromUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  }
}

async function isProductionAnalyticsEnabled(): Promise<boolean> {
  // Explicit flag wins. Set NEXT_PUBLIC_ANALYTICS_ENABLED=true only in production.
  const flag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED ?? process.env.ANALYTICS_ENABLED;
  if (flag === "true") return true;
  if (flag === "false") return false;
  const requestHost = ((await headers()).get("host") || "").split(":")[0].toLowerCase();
  const appHost = hostnameFromUrl(process.env.APP_URL);
  return PRODUCTION_ANALYTICS_HOSTS.has(requestHost) || PRODUCTION_ANALYTICS_HOSTS.has(appHost);
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  // Cuentas con sesión que no han aceptado las versiones vigentes de la Política de Privacidad y los Términos: todo el sitio queda tras el aviso.
  const privacy = privacyGateFor(user);
  const productionAnalytics = await isProductionAnalyticsEnabled();
  const pathname = (await headers()).get("x-pathname") || "";
  const agente360 = pathname === "/agente-360go" || pathname.startsWith("/agente-360go/");
  return (
    <html lang="es-CL" className={`${display.variable} ${bodyFont.variable}`}>
      <body className={agente360 ? "app-standalone" : undefined}>
        <CookieConsentBanner />
        {/* GTM y GA solo tras consentimiento explícito. /agente-360go sigue sin etiquetas, como en producción. */}
        {productionAnalytics && !agente360 ? <AnalyticsConsent /> : null}
        {agente360 ? null : <HubSpotTracking portalId={hubspotPortalId()} />}
        {agente360 ? (
          <main className="agente-360-main">
            {privacy.required && user ? (
              <PrivacyGate
                name={user.contactName || user.razonSocial}
                version={privacyVersion()}
                termsVersion={termsVersion()}
                firstTime={privacy.firstTime}
                terms={<TermsBody prefix="t-" />}
              >
                <PolicyBody prefix="p-" />
              </PrivacyGate>
            ) : (
              children
            )}
          </main>
        ) : (
          <div className="app-shell">
            <Header user={user} />
            <div className="shell-content">
              <main id="contenido">
                {privacy.required && user ? (
                  <PrivacyGate
                    name={user.contactName || user.razonSocial}
                    version={privacyVersion()}
                    termsVersion={termsVersion()}
                    firstTime={privacy.firstTime}
                    terms={<TermsBody prefix="t-" />}
                  >
                    <PolicyBody prefix="p-" />
                  </PrivacyGate>
                ) : (
                  children
                )}
              </main>
              <Footer analyticsConsent={productionAnalytics} />
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
