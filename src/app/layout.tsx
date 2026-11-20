import type { Metadata, Viewport } from "next";
import { Figtree, Sora, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import Script from "next/script";
import { AnalyticsRouteGuard } from "@/components/AnalyticsRouteGuard";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { AppFrame } from "@/components/AppFrame";
import { Footer } from "@/components/Footer";
import { HubSpotTracking } from "@/components/HubSpotTracking";
import { PolicyBody, TermsBody } from "@/components/PolicyBody";
import { PrivacyGate } from "@/components/PrivacyGate";
import { privacyGateFor } from "@/lib/accreditation";
import {
  GA_MEASUREMENT_ID,
  GTM_ID,
  gtagBootstrapScript,
  isAdminPathname,
} from "@/lib/analytics";
import { getCurrentUser } from "@/lib/current-user";
import { hubspotPortalId } from "@/lib/hubspot";
import { privacyVersion, termsVersion } from "@/lib/privacy";
import { BRAND } from "@/lib/catalog";
import "./tokens.css";
import "./globals.css";
import "./portada-shell.css";
import "./public-theme.css";

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

const publicSans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-public",
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

export const dynamic = "force-dynamic";

const PRODUCTION_ANALYTICS_HOSTS = new Set(["www.carga360go.cl", "carga360go.cl"]);

const title = "Plataforma ÓRBITA · Sistema Carga360go";
const description =
  `Carga360go conecta cargas y camiones en Chile. Publicas tu carga o tu camión, ves el calce y un costo de referencia desglosado. El historial registra publicación, ofertas y adjudicación. No incluye GPS ni telemetría. ${BRAND.company} · RUT ${BRAND.rut}.`;

export const metadata: Metadata = {
  metadataBase: new URL("https://www.carga360go.cl"),
  title: { default: "Plataforma tecnológica de carga en Chile · ÓRBITA Carga360go", template: "%s · ÓRBITA Carga360go" },
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
        alt: "Plataforma ÓRBITA · Sistema Carga360go",
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
  themeColor: "#000000",
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
  const portada = pathname === "/";
  const publico = !pathname.startsWith("/admin");
  const loadAnalyticsTags = productionAnalytics && !isAdminPathname(pathname) && !agente360;
  return (
    <html lang="es-CL" className={`${display.variable} ${bodyFont.variable} ${publicSans.variable}`}>
      <body
        className={
          [agente360 ? "app-standalone" : "", portada ? "portada-body" : "", publico ? "public-theme" : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        <CookieConsentBanner />
        {loadAnalyticsTags ? (
          <>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
                height="0"
                width="0"
                style={{ display: "none", visibility: "hidden" }}
                title="Google Tag Manager"
              />
            </noscript>
            <Script id="google-tag-manager" strategy="afterInteractive">
              {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
            </Script>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {gtagBootstrapScript()}
            </Script>
          </>
        ) : null}
        {productionAnalytics && !agente360 ? <AnalyticsRouteGuard /> : null}
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
          <AppFrame user={user}>
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
            <Footer />
          </AppFrame>
        )}
      </body>
    </html>
  );
}
