"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";
import { GA_DISABLE_KEY, GA_MEASUREMENT_ID, GTM_ID, gtagBootstrapScript, isAdminPathname } from "@/lib/analytics";
import {
  CONSENT_OPEN_EVENT,
  type StoredChoice,
  consentView,
  decideConsent,
  deleteAnalyticsCookies,
  disableAnalyticsHits,
  readConsent,
  writeConsent,
} from "@/lib/analytics-consent";

export { CONSENT_KEY } from "@/lib/analytics-consent";

type GuardWindow = Window & {
  __c360AnalyticsGuard?: boolean;
};

function pathFromUrl(url: unknown): string {
  if (url == null || url === "") return window.location.pathname;
  try {
    return new URL(String(url), window.location.origin).pathname;
  } catch {
    return String(url).split("?")[0].split("#")[0];
  }
}

function syncDisable(pathname: string) {
  (window as unknown as Record<string, unknown>)[GA_DISABLE_KEY] = isAdminPathname(pathname);
}

function installHistoryGuard() {
  const w = window as GuardWindow;
  if (w.__c360AnalyticsGuard) return;
  w.__c360AnalyticsGuard = true;
  syncDisable(window.location.pathname);
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);
  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    syncDisable(pathFromUrl(args[2]));
    return pushState(...args);
  }) as History["pushState"];
  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    syncDisable(pathFromUrl(args[2]));
    return replaceState(...args);
  }) as History["replaceState"];
  window.addEventListener("popstate", () => syncDisable(window.location.pathname));
}

/**
 * Consentimiento previo para GTM y GA4 (P1-06).
 * - Por defecto NO se carga ningún script de Google: ni GTM, ni gtag, ni el iframe noscript.
 * - Solo con "Aceptar" (guardado en localStorage) se cargan GTM y GA4, y nunca en /admin.
 * - "Rechazar" también se guarda y no carga nada.
 * - El enlace «Preferencias de privacidad» del pie reabre el banner. Revocar tras haber aceptado borra las cookies
 *   _ga/_gid y recarga la página para que no quede ningún script de Google activo.
 * La lógica pura vive en src/lib/analytics-consent.ts (con pruebas).
 */
export function AnalyticsConsent() {
  const pathname = usePathname() || "";
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<StoredChoice>("unset");
  const [reopened, setReopened] = useState(false);

  if (typeof window !== "undefined") {
    syncDisable(pathname);
  }

  useEffect(() => {
    setChoice(readConsent(window.localStorage));
    setLoading(false);
    const reopen = () => setReopened(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  useEffect(() => {
    syncDisable(pathname);
    installHistoryGuard();
  }, [pathname]);

  function decide(value: "granted" | "denied") {
    const result = decideConsent(choice, value);
    writeConsent(window.localStorage, result.choice);
    if (result.cleanupAndReload) {
      disableAnalyticsHits(window as unknown as Record<string, unknown>);
      deleteAnalyticsCookies(document, window.location.hostname);
      window.location.reload();
      return;
    }
    setChoice(result.choice);
    setReopened(false);
  }

  const view = consentView({ loading, choice, reopened, pathname });

  return (
    <>
      {view.showBanner ? (
        <div className="consent-banner" role="region" aria-label="Consentimiento de analítica">
          <p>
            Usamos Google Tag Manager y Google Analytics para medir el uso del sitio, solo si lo aceptas. Si rechazas, no se carga nada.
            {choice !== "unset" ? ` Tu elección actual: ${choice === "granted" ? "aceptada" : "rechazada"}.` : ""}{" "}
            <Link href="/privacidad">Política de privacidad</Link>.
          </p>
          <div className="consent-actions">
            <button type="button" className="btn sec sm" onClick={() => decide("denied")}>
              Rechazar
            </button>
            <button type="button" className="btn sm" onClick={() => decide("granted")}>
              Aceptar
            </button>
          </div>
        </div>
      ) : null}
      {view.loadScripts ? (
        <>
          <Script id="google-tag-manager" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {gtagBootstrapScript()}
          </Script>
        </>
      ) : null}
    </>
  );
}
