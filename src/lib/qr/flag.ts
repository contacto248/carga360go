import { AppError } from "../errors";

/**
 * Fase 1 del QR: trato, folio y retiro firmado.
 * Solo el texto exacto "true" lo enciende. Ausente, vacío, "TRUE", "1" o "false" lo dejan apagado.
 */
export function qrFase1Enabled(): boolean {
  return process.env.QR_FASE1_ENABLED === "true";
}

/** 404: con el flag apagado estas rutas no existen. */
export function assertQrFase1(): void {
  if (!qrFase1Enabled()) throw new AppError("No encontrado.", 404);
}

const QR_PAGE = /^\/(?:viajes\/[^/]+\/(?:comprobante|escanear|entrega)|d\/[^/]+)\/?$/;
const QR_API =
  /^\/api\/(?:viajes\/[^/]+\/(?:asignacion|chofer-foto|comprobante(?:\/pdf)?|delegados|entrega\/(?:conformidad|validar)|retiro\/(?:confirmar|validar)|sync|trato\/(?:codigo|confirmar))|d\/[^/]+(?:\/(?:confirmar|foto|pdf))?)\/?$/;

/** true cuando la ruta es del flujo QR y el flag no es exactamente "true". */
export function qrFase1Hidden(pathname: string): boolean {
  if (qrFase1Enabled()) return false;
  const path = pathname.split("?")[0]?.split("#")[0] ?? "";
  return QR_PAGE.test(path) || QR_API.test(path);
}

/**
 * Enlace de un solo uso para que el mandante pase el QR a quien entrega en bodega.
 * "true" lo enciende y "false" lo apaga. Si no está definido, queda encendido en staging.
 * No abre el flujo: QR_FASE1_ENABLED tiene que ser "true".
 */
export function delegateLinkEnabled(): boolean {
  const raw = process.env.QR_DELEGADO_ENABLED;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const stage = `${process.env.APP_ENV || ""} ${process.env.C360_ENV || ""} ${process.env.VERCEL_ENV || ""}`.toLowerCase();
  return /\bstaging\b|\bpreview\b/.test(stage);
}
