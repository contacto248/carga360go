"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  makeConsentDecision,
  parseCookieConsent,
  serializeCookieConsent,
  type CookieConsentDecision,
} from "@/lib/cookie-consent";

function persist(decision: CookieConsentDecision) {
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, serializeCookieConsent(decision));
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: decision }));
}

/**
 * Banner mínimo de cookies no esenciales (Ley 21.719 desde 01-12-2026).
 * Compacto abajo: no tapa el primer pantallazo ni el encabezado.
 * Sin este aviso no se carga HubSpot ni otras cookies de marketing.
 */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = parseCookieConsent(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
    setVisible(!existing);
  }, []);

  if (!visible) return null;

  function decide(marketing: boolean) {
    persist(makeConsentDecision(marketing));
    setVisible(false);
  }

  return (
    <aside
      className="cookie-banner cookie-banner-compact"
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-desc"
    >
      <div className="cookie-banner-inner wrap">
        <div className="cookie-banner-copy">
          <strong id="cookie-banner-title">Cookies</strong>
          <p id="cookie-banner-desc">
            Necesarias para la sesión. Marketing (HubSpot) solo con tu permiso.{" "}
            <Link href="/privacidad">Privacidad</Link>
          </p>
        </div>
        <div className="cookie-banner-actions">
          <button type="button" className="btn sec sm" onClick={() => decide(false)}>
            Solo necesarias
          </button>
          <button type="button" className="btn sm" onClick={() => decide(true)}>
            Aceptar
          </button>
        </div>
      </div>
    </aside>
  );
}
