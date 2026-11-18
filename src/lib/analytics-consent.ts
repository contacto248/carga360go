import { GA_DISABLE_KEY, isAdminPathname } from "@/lib/analytics";

/** Clave de localStorage: "granted" (aceptó) o "denied" (rechazó). Sin valor = aún no decide, y no se carga nada. */
export const CONSENT_KEY = "c360-analytics-consent";

/** Evento del navegador que reabre el banner (lo dispara el enlace «Preferencias de privacidad» del pie). */
export const CONSENT_OPEN_EVENT = "c360:open-consent";

export type StoredChoice = "granted" | "denied" | "unset";

/** Lo mínimo que se usa de localStorage; permite probar la lógica sin navegador. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readConsent(storage: StorageLike | null | undefined): StoredChoice {
  try {
    const value = storage?.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "unset";
  }
}

export function writeConsent(storage: StorageLike | null | undefined, value: "granted" | "denied"): void {
  try {
    storage?.setItem(CONSENT_KEY, value);
  } catch {
    /* sin almacenamiento: la elección vale solo para esta visita */
  }
}

export function clearConsent(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(CONSENT_KEY);
  } catch {
    /* nada que borrar */
  }
}

/**
 * Qué se muestra. Scripts de Google solo con "granted" y fuera de /admin.
 * El banner se muestra mientras no haya elección, o cuando la persona lo reabre desde el pie. Nunca en /admin.
 */
export function consentView(input: { loading: boolean; choice: StoredChoice; reopened: boolean; pathname: string }): {
  showBanner: boolean;
  loadScripts: boolean;
} {
  if (input.loading || isAdminPathname(input.pathname)) return { showBanner: false, loadScripts: false };
  return {
    showBanner: input.choice === "unset" || input.reopened,
    loadScripts: input.choice === "granted",
  };
}

/**
 * Qué hacer al elegir. Revocar después de haber aceptado exige limpiar cookies y recargar: los scripts de Google
 * ya están cargados en memoria y no se pueden descargar.
 */
export function decideConsent(previous: StoredChoice, next: "granted" | "denied"): { choice: "granted" | "denied"; cleanupAndReload: boolean } {
  return { choice: next, cleanupAndReload: next === "denied" && previous === "granted" };
}

/** Nombres de cookies de Google Analytics / GTM presentes en `document.cookie`. */
export function analyticsCookieNames(cookieString: string): string[] {
  return cookieString
    .split(";")
    .map((part) => part.split("=")[0].trim())
    .filter((name) => /^(_ga|_gid|_gat|_gcl_)/.test(name));
}

/** Dominios en los que pudo quedar la cookie: el host y sus padres (con y sin punto inicial). */
export function cookieDomains(hostname: string): string[] {
  const parts = hostname.split(".");
  const out: string[] = [];
  if (parts.length < 2 || /^\d+(\.\d+){3}$/.test(hostname)) return out;
  for (let i = 0; i <= parts.length - 2; i++) {
    const domain = parts.slice(i).join(".");
    out.push(domain, `.${domain}`);
  }
  return out;
}

/** Borra las cookies _ga*, _gid, _gat* y _gcl_* de este sitio. */
export function deleteAnalyticsCookies(doc: Pick<Document, "cookie">, hostname: string): string[] {
  const names = analyticsCookieNames(doc.cookie);
  const expired = "expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  for (const name of names) {
    doc.cookie = `${name}=; ${expired}`;
    for (const domain of cookieDomains(hostname)) doc.cookie = `${name}=; ${expired}; domain=${domain}`;
  }
  return names;
}

/** Marca de Google Analytics para que deje de enviar datos en esta página aunque el script siga en memoria. */
export function disableAnalyticsHits(target: Record<string, unknown>): void {
  target[GA_DISABLE_KEY] = true;
}
