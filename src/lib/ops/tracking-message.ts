/** Aviso cuando el enlace ya existe y no se puede volver a mostrar el token. */
export const ENLACE_YA_EMITIDO = "El enlace ya fue emitido; para uno nuevo, revócalo";

type CuerpoEnlace = {
  created?: boolean;
  path?: string;
  token?: string;
  error?: string;
};

/** Texto que ve quien pide el enlace. No usa un token ausente. */
export function textoReemision(body: CuerpoEnlace | null, ok: boolean): string {
  if (!ok) return body?.error || "No se pudo emitir el enlace.";
  if (body?.created === true && body.path && body.token) return body.path;
  return ENLACE_YA_EMITIDO;
}
