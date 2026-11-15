/**
 * Import dinámico: si NEXT_PUBLIC_SENTRY_DSN queda vacío en el build,
 * el paquete no entra al bundle del navegador.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (typeof dsn === "string" && dsn.trim()) {
  void import("./lib/sentry/client");
}
