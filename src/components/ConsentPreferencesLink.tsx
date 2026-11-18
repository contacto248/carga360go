"use client";

import { CONSENT_OPEN_EVENT } from "@/lib/analytics-consent";

/** Enlace del pie que vuelve a abrir el banner de consentimiento de analítica (cambiar o revocar). */
export function ConsentPreferencesLink() {
  return (
    <button type="button" className="linkish consent-link" onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}>
      Preferencias de privacidad
    </button>
  );
}
