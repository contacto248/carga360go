/**
 * Verificación de identidad con Didit (cédula chilena + prueba de vida + comparación de rostro).
 *
 * Todo el módulo queda apagado mientras KYC_FEATURE_ENABLED no sea exactamente "true":
 * no se muestran pantallas, las rutas responden 404, la acreditación no cambia y no se toca la base.
 *
 * Variables de entorno (solo nombres; los valores van en el .env del servidor, nunca en el repo):
 *  - KYC_FEATURE_ENABLED   "true" para activar (por defecto apagado)
 *  - DIDIT_API_KEY         API key de la aplicación en business.didit.me (secreta)
 *  - DIDIT_WEBHOOK_SECRET  secret_shared_key del destino de webhook (secreto)
 *  - DIDIT_WORKFLOW_ID     UUID del workflow KYC publicado (cédula + liveness + face match)
 *  - DIDIT_API_BASE        opcional, por defecto https://verification.didit.me
 *  - DIDIT_ENVIRONMENT     opcional: "sandbox" o "live". Si se define, se ignoran webhooks del otro ambiente.
 */
export function kycEnabled(): boolean {
  return process.env.KYC_FEATURE_ENABLED === "true";
}

export function diditApiBase(): string {
  return (process.env.DIDIT_API_BASE || "https://verification.didit.me").replace(/\/$/, "");
}

export function diditApiKey(): string {
  return process.env.DIDIT_API_KEY || "";
}

export function diditWebhookSecret(): string {
  return process.env.DIDIT_WEBHOOK_SECRET || "";
}

export function diditWorkflowId(): string {
  return process.env.DIDIT_WORKFLOW_ID || "";
}

export function diditExpectedEnvironment(): "sandbox" | "live" | null {
  const value = process.env.DIDIT_ENVIRONMENT;
  return value === "sandbox" || value === "live" ? value : null;
}

/** Listo para crear sesiones (sin revelar valores). */
export function diditConfigured(): { apiKey: boolean; workflow: boolean; webhookSecret: boolean } {
  return { apiKey: Boolean(diditApiKey()), workflow: Boolean(diditWorkflowId()), webhookSecret: Boolean(diditWebhookSecret()) };
}

/** Intentos de verificación propios (sesiones creadas) antes de requerir que un administrador lo revise. */
export const KYC_MAX_ATTEMPTS = 3;

/** Ventana de frescura de la firma del webhook (segundos), según la documentación de Didit. */
export const WEBHOOK_MAX_SKEW_S = 300;

/** Días de gracia para cuentas que ya estaban acreditadas cuando se enciende el flag. */
export const KYC_GRACE_DAYS = 15;

