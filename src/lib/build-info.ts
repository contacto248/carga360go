const SHA_RE = /^[0-9a-f]{7,40}$/;

/**
 * SHA corto del commit desplegado. Solo lee GIT_SHA (variable de build).
 * Si falta o no es hexadecimal, devuelve "unknown" y no refleja el resto del entorno.
 */
export function deployedCommit(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.GIT_SHA ?? "").trim().toLowerCase();
  if (!SHA_RE.test(raw)) return "unknown";
  return raw.slice(0, 7);
}
