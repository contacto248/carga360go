"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";
import {
  GA_DISABLE_KEY,
  GA_MEASUREMENT_ID,
  GTM_ID,
  gtagBootstrapScript,
  isAdminPathname,
} from "@/lib/analytics";

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
 * Keeps GA4 disabled on /admin after client-side navigation.
 * If the first load was /admin (tags not in the document), loads them when leaving for a public route.
 */
export function AnalyticsRouteGuard() {
  const pathname = usePathname() || "";
  const [loadScripts, setLoadScripts] = useState(false);

  if (typeof window !== "undefined") {
    syncDisable(pathname);
  }

  useEffect(() => {
    syncDisable(pathname);
    installHistoryGuard();
    if (!isAdminPathname(pathname) && !document.getElementById("google-tag-manager")) {
      setLoadScripts(true);
    }
  }, [pathname]);

  if (!loadScripts) return null;

  return (
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
  );
}
