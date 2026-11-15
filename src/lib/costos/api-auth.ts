import { timingSafeEqual } from "crypto";
import { AppError } from "../errors";
import { clientIp, userFromHeaders } from "../request-auth";
import type { PublicUser } from "../types";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Claves de servicio para el agente de voz y CARGA360 Match: COSTOS_API_KEYS="agente_voz:clave1,match:clave2"
 * (cada clave de 24+ caracteres). Se envían en el encabezado X-Costos-Key. Sin variable configurada, solo
 * administradores con sesión pueden usar el motor por API.
 */
export function serviceFromKey(headers: Headers): string | null {
  const given = headers.get("x-costos-key")?.trim();
  if (!given) return null;
  for (const entry of (process.env.COSTOS_API_KEYS || "").split(",")) {
    const index = entry.indexOf(":");
    if (index <= 0) continue;
    const name = entry.slice(0, index).trim();
    const key = entry.slice(index + 1).trim();
    if (key.length >= 24 && safeEqual(given, key)) return name;
  }
  throw new AppError("Clave de servicio no válida.", 401);
}

export type EngineCaller = { kind: "admin"; user: PublicUser; ip: string } | { kind: "service"; service: string; ip: string };

export function engineCaller(headers: Headers): EngineCaller {
  const ip = clientIp(headers);
  const service = serviceFromKey(headers);
  if (service) return { kind: "service", service, ip };
  const user = userFromHeaders(headers);
  if (!user) throw new AppError("Debes iniciar sesión o enviar una clave de servicio.", 401);
  if (user.role !== "admin") throw new AppError("No tienes permiso para esta acción.", 403);
  return { kind: "admin", user, ip };
}

export function requireAdminHeaders(headers: Headers): PublicUser {
  const user = userFromHeaders(headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  if (user.role !== "admin") throw new AppError("No tienes permiso para esta acción.", 403);
  return user;
}

/** Secreto del cron (COSTOS_CRON_SECRET, 32+ caracteres) en Authorization: Bearer. */
export function assertCron(headers: Headers) {
  const secret = process.env.COSTOS_CRON_SECRET || "";
  if (secret.length < 32) throw new AppError("El job de costos no está configurado (falta COSTOS_CRON_SECRET).", 503);
  const header = headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match || !safeEqual(match[1], secret)) throw new AppError("No autorizado.", 401);
}
