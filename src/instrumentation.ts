import { sentryEnabled } from "@/lib/sentry/options";

type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type ErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
};

/**
 * Import dinámico: el SDK de Node y el de Edge no pueden cargarse juntos,
 * y sin DSN no se carga ninguno (no hay inicialización ni red).
 */
export async function register(): Promise<void> {
  if (!sentryEnabled()) return;
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  else if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export async function onRequestError(error: unknown, request: RequestInfo, context: ErrorContext): Promise<void> {
  if (!sentryEnabled()) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(error, request, context);
}
