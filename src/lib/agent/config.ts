import { getSetting, setSetting } from "../whatsapp/store";

export const AGENT_COOKIE = "c360_agente";
export const AGENT_COOKIE_DAYS = 30;
/** Largo máximo de un mensaje (texto o transcripción de voz). */
export const AGENT_MAX_MESSAGE = 500;
/** Límites: por IP y por sesión (en memoria) y por sesión en la base (sobrevive reinicios). */
export const AGENT_RATE = {
  perIp: 40,
  perSession: 30,
  windowMs: 10 * 60 * 1000,
  perSessionDay: 150,
};

function flag(setting: string, env: string | undefined): boolean {
  const value = getSetting(setting);
  if (value === "on") return true;
  if (value === "off") return false;
  return env === "true";
}

/** Widget del agente en la web: el panel de administración manda; si no se tocó, AGENT_ENABLED (apagado por defecto). */
export function agentEnabled(): boolean {
  return flag("agent_enabled", process.env.AGENT_ENABLED);
}

export function setAgentEnabled(enabled: boolean) {
  setSetting("agent_enabled", enabled ? "on" : "off");
}

/** El bot de WhatsApp usa el flujo del agente (cotizar, registro, estado, persona). Apagado por defecto. */
export function agentWhatsappEnabled(): boolean {
  return flag("agent_whatsapp_enabled", process.env.AGENT_WHATSAPP_ENABLED);
}

export function setAgentWhatsappEnabled(enabled: boolean) {
  setSetting("agent_whatsapp_enabled", enabled ? "on" : "off");
}

export function agentCookieOptions() {
  const secure = process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false");
  return { httpOnly: true as const, sameSite: "lax" as const, secure, path: "/", maxAge: AGENT_COOKIE_DAYS * 24 * 60 * 60 };
}
