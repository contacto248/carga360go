/**
 * Consentimiento mínimo de cookies no esenciales (Ley 21.719, vigencia desde 01-12-2026).
 * Las cookies técnicas de sesión no requieren banner; HubSpot y similares sí.
 */

export const COOKIE_CONSENT_STORAGE_KEY = "c360_cookie_consent";
export const COOKIE_CONSENT_VERSION = "1";
export const COOKIE_CONSENT_EVENT = "c360:cookie-consent";

export type CookieConsentDecision = {
  version: string;
  necessary: true;
  /** Cookies de medición/marketing (HubSpot tracking). */
  marketing: boolean;
  decidedAt: string;
};

export function parseCookieConsent(raw: string | null | undefined): CookieConsentDecision | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<CookieConsentDecision>;
    if (data.version !== COOKIE_CONSENT_VERSION) return null;
    if (data.necessary !== true) return null;
    if (typeof data.marketing !== "boolean") return null;
    if (typeof data.decidedAt !== "string" || !data.decidedAt) return null;
    return {
      version: COOKIE_CONSENT_VERSION,
      necessary: true,
      marketing: data.marketing,
      decidedAt: data.decidedAt,
    };
  } catch {
    return null;
  }
}

export function hasMarketingConsent(decision: CookieConsentDecision | null): boolean {
  return decision?.marketing === true;
}

export function makeConsentDecision(marketing: boolean, decidedAt = new Date().toISOString()): CookieConsentDecision {
  return {
    version: COOKIE_CONSENT_VERSION,
    necessary: true,
    marketing,
    decidedAt,
  };
}

export function serializeCookieConsent(decision: CookieConsentDecision): string {
  return JSON.stringify(decision);
}
