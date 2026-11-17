export type SessionSignal = {
  url?: string | null;
  status?: number | null;
  location?: string | null;
  text?: string | null;
};

export class SessionExpiredError extends Error {
  readonly code = "session_expired";

  constructor(message = "Sesión expirada. Este repositorio no reloguea ni usa credenciales.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

function pathnameOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) return null;
    return trimmed.split(/[?#]/, 1)[0] || "/";
  }
  try {
    return new URL(trimmed).pathname;
  } catch {
    return null;
  }
}

function isLoginPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/ingreso" ||
    pathname.startsWith("/ingreso/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/")
  );
}

const EXPIRED_TEXT = /sesi[oó]n (ha )?expirad[ao]/i;

/** Pura y testeable. No abre navegador, no lee secretos y no inicia sesión. */
export function isSessionExpired(signal: SessionSignal): boolean {
  if (signal.status === 401) return true;
  if (isLoginPath(pathnameOf(signal.url ?? ""))) return true;
  if (isLoginPath(pathnameOf(signal.location ?? ""))) return true;
  return EXPIRED_TEXT.test(signal.text ?? "");
}
