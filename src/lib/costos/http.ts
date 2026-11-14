/**
 * Cliente HTTP de las fuentes externas del motor. Identifica la aplicación con un User-Agent propio
 * (exigido por las políticas de uso de Nominatim y del servidor público de OSRM), espacia las solicitudes
 * por servidor (máx. 1 por segundo) y permite reemplazar fetch en pruebas, que no salen a internet.
 */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let impl: FetchLike | null = null;
const lastCall = new Map<string, number>();

export function setCostosFetch(fn: FetchLike | null) {
  impl = fn;
  lastCall.clear();
}

export function userAgent(): string {
  return process.env.COSTOS_USER_AGENT || "Carga360Go-motor-costos/1.0 (+https://carga360go.cl; contacto@carga360go.cl)";
}

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export async function fetchSource(url: string, init: RequestInit & { minIntervalMs?: number; timeoutMs?: number } = {}): Promise<Response> {
  const host = new URL(url).host;
  const wait = (lastCall.get(host) ?? 0) + (init.minIntervalMs ?? 1100) - Date.now();
  if (wait > 0 && !impl) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCall.set(host, Date.now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  try {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", userAgent());
    if (!headers.has("Accept")) headers.set("Accept", "application/json, text/csv;q=0.9, */*;q=0.5");
    const response = await (impl ?? (fetch as FetchLike))(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) throw new SourceError(`${host} respondió ${response.status}`);
    return response;
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(`${host} no respondió: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}
