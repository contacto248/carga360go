import { AppError } from "./errors";
import { kycEnabled } from "./kyc/config";
import { paymentsLegalPublished } from "./pagos/config";

/** Versión publicada hoy (sin el módulo KYC). */
export const PRIVACY_VERSION_BASE = "1.5.1-2026-11-18";
export const PRIVACY_UPDATED_BASE = "18 de noviembre de 2026";
/**
 * Versión que se publica junto con KYC_FEATURE_ENABLED=true
 * (adición de verificación de identidad y datos biométricos).
 */
export const PRIVACY_VERSION_KYC = "1.6.1-2026-11-18";
export const PRIVACY_UPDATED_KYC = "18 de noviembre de 2026";

/**
 * Versión vigente según el flag. Con el flag apagado se publica la 1.5.
 * Al encender KYC, sube a 1.6 y el sitio pide a todas las cuentas aceptarla de nuevo.
 */
/**
 * Versión que se usa con PAYMENTS_FEATURE_ENABLED=true (pago de fletes con Mercado Pago).
 * Solo staging mientras el flag siga apagado en producción.
 */
export const PRIVACY_VERSION_PAYMENTS = "1.7.1-2026-11-18";
export const PRIVACY_UPDATED_PAYMENTS = "18 de noviembre de 2026";

export function privacyVersion(): string {
  if (paymentsLegalPublished()) return PRIVACY_VERSION_PAYMENTS;
  return kycEnabled() ? PRIVACY_VERSION_KYC : PRIVACY_VERSION_BASE;
}

export function privacyUpdated(): string {
  if (paymentsLegalPublished()) return PRIVACY_UPDATED_PAYMENTS;
  return kycEnabled() ? PRIVACY_UPDATED_KYC : PRIVACY_UPDATED_BASE;
}

/** Compatibilidad: versión cuando el flag está apagado. Preferir privacyVersion(). */
export const PRIVACY_VERSION = PRIVACY_VERSION_BASE;
export const PRIVACY_UPDATED = PRIVACY_UPDATED_BASE;

/** Versión vigente de los Términos de uso. Cambiarla cuando cambie el texto de /terminos. */
export const TERMS_VERSION = "1.2-2026-11-17";
export const TERMS_UPDATED = "17 de noviembre de 2026";
/** Términos con el pago de fletes (PAYMENTS_FEATURE_ENABLED=true). Al cambiar la versión, el sitio pide aceptarlos de nuevo. */
export const TERMS_VERSION_PAYMENTS = "1.3-2026-11-17";
export const TERMS_UPDATED_PAYMENTS = "17 de noviembre de 2026";

export function termsVersion(): string {
  return paymentsLegalPublished() ? TERMS_VERSION_PAYMENTS : TERMS_VERSION;
}

export function termsUpdated(): string {
  return paymentsLegalPublished() ? TERMS_UPDATED_PAYMENTS : TERMS_UPDATED;
}

export const PRIVACY_REQUIRED_MESSAGE = "Para crear tu cuenta debes leer y aceptar la Política de Privacidad.";
export const TERMS_REQUIRED_MESSAGE = "Para crear tu cuenta debes leer y aceptar los Términos de uso.";

/** El registro (web y app) exige la aceptación explícita: el valor debe ser exactamente true. */
export function assertPrivacyAccepted(body: Record<string, unknown>): string {
  const accepted = body.acceptPrivacy === true || body.privacyAccepted === true;
  if (!accepted) throw new AppError(PRIVACY_REQUIRED_MESSAGE, 400, "privacidad_requerida");
  return privacyVersion();
}

export function assertTermsAccepted(body: Record<string, unknown>): string {
  const accepted = body.acceptTerms === true || body.termsAccepted === true;
  if (!accepted) throw new AppError(TERMS_REQUIRED_MESSAGE, 400, "terminos_requeridos");
  return termsVersion();
}

/** Política de Privacidad y Términos de uso se aceptan juntos (registro y aviso al ingresar). */
export function assertLegalAccepted(body: Record<string, unknown>): { privacyVersion: string; termsVersion: string } {
  return { privacyVersion: assertPrivacyAccepted(body), termsVersion: assertTermsAccepted(body) };
}
