import { cookieSecure } from "../auth";
import { getSetting, setSetting } from "../whatsapp/store";

export const CHAT_COOKIE = "c360_chat";
export const CHAT_COOKIE_DAYS = 30;
export const CHAT_MAX_MESSAGE = 1000;
export const CHAT_RATE = {
  perIp: 30,
  perSession: 20,
  windowMs: 10 * 60 * 1000,
  perSessionDay: 80,
};

/** Chat de la web: el panel manda si se tocó; si no, WEB_CHAT_ENABLED (apagado por defecto). */
export function webChatEnabled(): boolean {
  const value = getSetting("web_chat_enabled");
  if (value === "on") return true;
  if (value === "off") return false;
  return process.env.WEB_CHAT_ENABLED === "true";
}

export function setWebChatEnabled(enabled: boolean) {
  setSetting("web_chat_enabled", enabled ? "on" : "off");
}

export function chatCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge: CHAT_COOKIE_DAYS * 24 * 60 * 60,
  };
}
