import { timingSafeEqual } from "crypto";
import { AppError } from "../errors";

/**
 * Autorización del evaluador de sin_senal.
 * Authorization: Bearer <OPS_ALERTAS_JOB_SECRET>, sin cookie de sesión.
 * El secreto vive en el entorno (24 caracteres o más). Sin secreto configurado, 503.
 * El flag OPS_FEATURE_ENABLED lo exige antes el opsGuard de la ruta: si no es "true", 404.
 */
export function assertAlertJob(headers: Headers): void {
  const secret = process.env.OPS_ALERTAS_JOB_SECRET?.trim() ?? "";
  if (secret.length < 24) throw new AppError("El evaluador de señal no está configurado.", 503);
  const match = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "");
  const given = match?.[1] ?? "";
  const left = Buffer.from(given);
  const right = Buffer.from(secret);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new AppError("No autorizado.", 401);
}
