/** Portal ID por defecto (cuenta Carga360go). Sobreescribible con NEXT_PUBLIC_HUBSPOT_PORTAL_ID. */
export const DEFAULT_HUBSPOT_PORTAL_ID = "52297745";

export function hubspotPortalId(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): string {
  const raw = env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID?.trim();
  if (raw && /^\d+$/.test(raw)) return raw;
  return DEFAULT_HUBSPOT_PORTAL_ID;
}

/** URL del loader HubSpot (mismo path que //js.hs-scripts.com/{portalId}.js). */
export function hubspotScriptSrc(portalId: string = hubspotPortalId()): string {
  return `//js.hs-scripts.com/${portalId}.js`;
}
