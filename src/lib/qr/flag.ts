/**
 * Enlace de un solo uso para que el mandante pase el QR a quien entrega en bodega.
 * "true" lo enciende y "false" lo apaga. Si no está definido, queda encendido en staging.
 */
export function delegateLinkEnabled(): boolean {
  const raw = process.env.QR_DELEGADO_ENABLED;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const stage = `${process.env.APP_ENV || ""} ${process.env.C360_ENV || ""} ${process.env.VERCEL_ENV || ""}`.toLowerCase();
  return /\bstaging\b|\bpreview\b/.test(stage);
}
