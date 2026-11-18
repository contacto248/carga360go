import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PolicyBody, TermsBody } from "@/components/PolicyBody";
import { PrivacyGate } from "@/components/PrivacyGate";
import { privacyGateFor } from "@/lib/accreditation";
import { getCurrentUser } from "@/lib/current-user";
import { privacyVersion, termsVersion } from "@/lib/privacy";
import { BRAND } from "@/lib/catalog";
import "./globals.css";

export const dynamic = "force-dynamic";

const PRODUCTION_ANALYTICS_HOSTS = new Set(["www.carga360go.cl", "carga360go.cl"]);

const title = "Carga360go — Cargas y camiones de transporte en todo Chile, de Arica a Punta Arenas";
const description =
  `Carga360go conecta cargas y camiones en Chile. Publica tu carga o tu camión, encuentra coincidencias por ruta, fecha y equipo, y coordina en directo. Sin comisión por el flete. ${BRAND.company} · RUT ${BRAND.rut}.`;

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
  return (
    <html lang="es-CL">
      <body>
        {/* GTM y GA solo se cargan tras un consentimiento explícito (banner de aceptar o rechazar). Ver AnalyticsConsent. */}
        {productionAnalytics ? <AnalyticsConsent /> : null}
        <Header user={user} />
        <main>
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
      </body>
    </html>
  );
}
