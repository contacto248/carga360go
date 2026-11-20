/**
 * Páginas públicas nuevas de #63: /clientes, /documentos y /finanzas.
 * Apagadas por defecto: el middleware y la página responden 404, y no salen
 * en el menú del header ni en el sitemap.
 * Solo el texto exacto "true" enciende. "TRUE", "1", "yes" y espacios quedan apagados.
 *
 * El valor se fija en el build: next.config.ts lo copia con `env`, así el menú
 * (componente cliente), el middleware, las páginas y el sitemap ven el mismo valor.
 * Cambiar el flag exige `npm run build` y reiniciar la app.
 */
export const UI_PAGINAS_PUBLICAS_NUEVAS_FLAG = "UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED";

export const PAGINAS_PUBLICAS_NUEVAS = ["/clientes", "/documentos", "/finanzas"] as const;

export function paginasPublicasNuevasEnabled(
  value: string | undefined = process.env.UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED,
): boolean {
  return value === "true";
}

export function paginasPublicasNuevasHidden(
  pathname: string,
  value: string | undefined = process.env.UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED,
): boolean {
  const path = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (!PAGINAS_PUBLICAS_NUEVAS.some((ruta) => ruta === path)) return false;
  return !paginasPublicasNuevasEnabled(value);
}
