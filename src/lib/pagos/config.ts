/**
 * Configuración del pago de fletes con Mercado Pago (Split 1:1, Checkout Pro).
 * Todo se lee de variables de entorno. Ningún valor secreto va en el código ni en el repositorio.
 * Con PAYMENTS_FEATURE_ENABLED distinto de "true" el módulo queda apagado: no hay botones,
 * las rutas responden 403/404 y no se crean tablas.
 */

export type MpEnv = "test" | "production";
export type FeePayer = "shipper" | "trucker";

export const MP_AUTHORIZE_URL = "https://auth.mercadopago.cl/authorization";
export const MP_API_BASE = "https://api.mercadopago.com";

/** Tópicos de webhook que el proyecto procesa. */
export const MP_TOPICS = ["payment", "topic_merchant_order_wh", "mp-connect", "topic_chargebacks_wh", "topic_claims_integration_wh"] as const;

export function paymentsEnabled(): boolean {
  return (process.env.PAYMENTS_FEATURE_ENABLED || "").trim().toLowerCase() === "true";
}

/**
 * Textos legales de pagos publicados (Términos 1.1, Privacidad 1.4, /politica-de-pagos y pie).
 * Se encienden con PAYMENTS_FEATURE_ENABLED=true o, sin abrir el cobro, con PAYMENTS_LEGAL_PUBLISHED=true.
 * El cobro (checkout, /panel/pagos, API de pagos) depende solo de paymentsEnabled().
 */
export function paymentsLegalPublished(): boolean {
  return paymentsEnabled() || (process.env.PAYMENTS_LEGAL_PUBLISHED || "").trim().toLowerCase() === "true";
}

/** Textos publicados pero cobro apagado: se agrega el aviso «disponible próximamente». */
export function paymentsComingSoon(): boolean {
  return paymentsLegalPublished() && !paymentsEnabled();
}

export const PAYMENTS_COMING_SOON_NOTE =
  "Disponibilidad: el pago de fletes con Mercado Pago dentro de la plataforma estará disponible próximamente. Mientras no esté habilitado, el mandante y el transportista acuerdan y hacen el pago directamente entre ellos, y Carga360go no participa en ese pago.";

export function mpEnv(): MpEnv {
  return (process.env.PAYMENTS_MP_ENV || "test").trim().toLowerCase() === "production" ? "production" : "test";
}

function num(name: string, fallback: number, opts: { min?: number; max?: number; int?: boolean } = {}): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (opts.int && !Number.isInteger(value)) return fallback;
  if (opts.min != null && value < opts.min) return fallback;
  if (opts.max != null && value > opts.max) return fallback;
  return value;
}

/** Valores de negocio. Los defaults son PROPUESTA (no aprobados) y se pueden cambiar por entorno. */
export function paymentRules() {
  const feePayerRaw = (process.env.PAYMENTS_FEE_PAYER || "shipper").trim().toLowerCase();
  return {
    anticipoPercent: num("PAYMENTS_ANTICIPO_PERCENT", 40, { min: 0, max: 100, int: true }),
    feePayer: (feePayerRaw === "trucker" ? "trucker" : "shipper") as FeePayer,
    feeRateEstimate: num("PAYMENTS_MP_FEE_RATE_ESTIMATE", 0.0319, { min: 0, max: 0.5 }),
    vatRate: num("PAYMENTS_VAT_RATE", 0.19, { min: 0, max: 1 }),
    marketplaceFeeAmount: num("PAYMENTS_MARKETPLACE_FEE_AMOUNT", 0, { min: 0, int: true }),
    disputeWindowBusinessHours: num("PAYMENTS_DISPUTE_WINDOW_BUSINESS_HOURS", 48, { min: 1, max: 24 * 30, int: true }),
    /** Feriados de Chile (YYYY-MM-DD separados por coma). Se cargan desde una fuente oficial; no se inventan en el código. */
    holidays: (process.env.PAYMENTS_CL_HOLIDAYS || "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
  };
}

/** Credenciales y URLs. Si falta algo, `missing` lo dice (solo nombres de variables, nunca valores). */
export function mpCredentials() {
  const values = {
    clientId: process.env.MP_CLIENT_ID?.trim() || "",
    clientSecret: process.env.MP_CLIENT_SECRET?.trim() || "",
    integratorPublicKey: process.env.MP_INTEGRATOR_PUBLIC_KEY?.trim() || "",
    webhookSecret: process.env.MP_WEBHOOK_SECRET?.trim() || "",
    redirectUri: process.env.MP_OAUTH_REDIRECT_URI?.trim() || "",
    notificationUrl: process.env.MP_NOTIFICATION_URL?.trim() || "",
  };
  const missing: string[] = [];
  // El Client ID es el número de la aplicación (APP ID). Un nombre de usuario de prueba (TESTUSER…) no sirve para OAuth.
  if (!values.clientId) missing.push("MP_CLIENT_ID");
  else if (!/^\d{6,20}$/.test(values.clientId)) missing.push("MP_CLIENT_ID (debe ser el número de la aplicación)");
  if (!values.clientSecret) missing.push("MP_CLIENT_SECRET");
  if (!values.redirectUri) missing.push("MP_OAUTH_REDIRECT_URI");
  return { ...values, missing, oauthReady: missing.length === 0 };
}

/**
 * ¿El live_mode que informa Mercado Pago corresponde al entorno?
 * Producción exige live_mode=true. En modo prueba MP usa cuentas de prueba que operan sobre la API productiva
 * y reportan live_mode=true, así que en "test" no se usa live_mode para rechazar (las credenciales ya son de prueba).
 */
export function liveModeAllowed(liveMode: boolean): boolean {
  return mpEnv() === "production" ? liveMode : true;
}

/** notification_url con source_news=webhooks: MP envía solo Webhooks firmados (sin las IPN antiguas sin firma). */
export function notificationUrlForPreference(raw: string): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.searchParams.set("source_news", "webhooks");
    return url.toString();
  } catch {
    return raw;
  }
}

export function cronSecret(): string {
  return process.env.PAYMENTS_CRON_SECRET?.trim() || "";
}

/** URL base pública para back_urls (no puede ser localhost según Mercado Pago). */
export function publicBaseUrl(): string {
  return (process.env.APP_URL || "https://www.carga360go.cl").replace(/\/+$/, "");
}

/** Estado de configuración para el panel de administración (sin valores). */
export function configStatus() {
  const creds = mpCredentials();
  return {
    enabled: paymentsEnabled(),
    env: mpEnv(),
    missing: [
      ...creds.missing,
      ...(creds.webhookSecret ? [] : ["MP_WEBHOOK_SECRET"]),
      ...(process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY ? [] : ["PAYMENTS_TOKEN_ENCRYPTION_KEY"]),
      ...(cronSecret() ? [] : ["PAYMENTS_CRON_SECRET"]),
    ],
    rules: paymentRules(),
  };
}
