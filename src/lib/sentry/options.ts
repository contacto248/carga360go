/**
 * Sentry queda apagado si no hay DSN. Este módulo no importa el SDK:
 * decidir y filtrar no puede abrir una conexión.
 *
 * @sentry/nextjs 11 reemplazó `sendDefaultPii` por `dataCollection`.
 * `sendDefaultPii: false` se sigue enviando en las opciones por si el runtime
 * lo reconoce, y `dataCollection` deja el mismo resultado: sin usuario, cookies,
 * headers, cuerpos ni query.
 */

export const SENTRY_TRACES_SAMPLE_RATE = 0.05;

const SENSITIVE_NAME = /(cookie|authorization|token|secret|password|passwd|api[-_]?key|credential|session)/i;
const SENSITIVE_QUERY = /^(token|access_token|refresh_token|id_token|code|secret|password|passwd|api_key|apikey|dsn|auth|session)$/i;

export type ScrubbableEvent = {
  request?: {
    url?: string;
    query_string?: string | Record<string, unknown> | Array<[string, unknown]>;
    headers?: Record<string, string | string[] | undefined>;
    cookies?: unknown;
    data?: unknown;
  };
  breadcrumbs?: Array<{ data?: Record<string, unknown> } | undefined>;
};

export function sentryDsn(): string {
  const server = process.env.SENTRY_DSN?.trim() ?? "";
  if (server) return server;
  return process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "";
}

export function sentryEnvironment(): string {
  const server = process.env.SENTRY_ENVIRONMENT?.trim() ?? "";
  if (server) return server;
  return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ?? "";
}

/** El build no inicializa el SDK: no hay envío mientras Next compila. */
export function sentryBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
}

export function sentryEnabled(): boolean {
  return !sentryBuildPhase() && sentryDsn().length > 0;
}

function redactUrl(value: string): string {
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
    const url = new URL(value, "http://localhost");
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY.test(key) || SENSITIVE_NAME.test(key)) url.searchParams.set(key, "[filtrado]");
    }
    if (!absolute) return `${url.pathname}${url.search}${url.hash}`;
    return url.toString();
  } catch {
    return value.replace(/([?&][^=&#]*(?:token|secret|password|api_key|dsn|code|auth)[^=&#]*=)[^&#]*/gi, "$1[filtrado]");
  }
}

function headerValueLooksSecret(value: string | string[] | undefined): boolean {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.some((item) => /^(bearer|basic)\s+\S+/i.test(item));
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (request?.headers) {
    for (const key of Object.keys(request.headers)) {
      if (SENSITIVE_NAME.test(key) || headerValueLooksSecret(request.headers[key])) delete request.headers[key];
    }
  }
  if (request) {
    delete request.cookies;
    if (typeof request.url === "string") request.url = redactUrl(request.url);
    if (typeof request.query_string === "string") request.query_string = scrubQuery(request.query_string);
    else if (Array.isArray(request.query_string)) {
      request.query_string = request.query_string.map(([key, value]): [string, unknown] =>
        SENSITIVE_QUERY.test(key) || SENSITIVE_NAME.test(key) ? [key, "[filtrado]"] : [key, value],
      );
    } else if (request.query_string && typeof request.query_string === "object") {
      for (const key of Object.keys(request.query_string)) {
        if (SENSITIVE_QUERY.test(key) || SENSITIVE_NAME.test(key)) delete request.query_string[key];
      }
    }
  }
  for (const crumb of event.breadcrumbs ?? []) {
    const data = crumb?.data;
    if (!data) continue;
    if (typeof data.url === "string") data.url = redactUrl(data.url);
    if ("headers" in data) delete data.headers;
    if ("cookie" in data) delete data.cookie;
    if ("cookies" in data) delete data.cookies;
  }
  return event;
}

function scrubQuery(value: string): string {
  return redactUrl(value.includes("://") || value.startsWith("/") ? value : `http://localhost/?${value.replace(/^\?/, "")}`).split("?")[1] ?? "";
}

export function buildSentryOptions(): Record<string, unknown> | null {
  if (!sentryEnabled()) return null;
  const environment = sentryEnvironment();
  return {
    dsn: sentryDsn(),
    enabled: true,
    environment: environment || undefined,
    sendDefaultPii: false,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    beforeSend(event: ScrubbableEvent) {
      return scrubSentryEvent(event);
    },
  };
}
