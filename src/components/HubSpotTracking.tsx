"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";
import { isAdminPathname } from "@/lib/analytics";
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  hasMarketingConsent,
  parseCookieConsent,
  type CookieConsentDecision,
} from "@/lib/cookie-consent";
import { hubspotScriptSrc } from "@/lib/hubspot";

type Props = {
  portalId: string;
};

/**
 * Carga el tracking de HubSpot solo tras consentimiento de cookies de marketing.
 * next/script con strategy afterInteractive (async); defer en el atributo del loader.
 */
export function HubSpotTracking({ portalId }: Props) {
  const pathname = usePathname() || "";
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    function sync(decision: CookieConsentDecision | null) {
      setAllowed(hasMarketingConsent(decision));
    }
    sync(parseCookieConsent(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)));
    function onConsent(event: Event) {
      const detail = (event as CustomEvent<CookieConsentDecision>).detail;
      sync(detail ?? parseCookieConsent(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)));
    }
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, []);

  if (!allowed || isAdminPathname(pathname)) return null;

  return (
    <Script
      id="hs-script-loader"
      src={hubspotScriptSrc(portalId)}
      strategy="afterInteractive"
      async
      defer
    />
  );
}
