/**
 * Cliente HTTP de AI.CARGA360.
 * API-first: una llamada tipada, con reintento y registro. Sin credenciales en código.
 * 429 y 5xx se reintentan. 401 no: es un rechazo, no un corte transitorio.
 */

export type AiHttpEvent = {
  step: "xai.chat";
  status: number | null;
  durationMs: number;
  attempt: number;
  outcome: "ok" | "retry" | "fail";
  reason: "ok" | "http" | "timeout" | "red";
};

export type HttpClientDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  baseDelayMs?: number;
  jitterMs?: () => number;
  log?: (event: AiHttpEvent) => void;
};

export type JsonPost = {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
};

export type JsonOutcome<T> =
  | { ok: true; status: number; data: T; attempts: number }
  | { ok: false; status: number | null; attempts: number; reason: "http" | "timeout" | "red" };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name = String(error.name);
  return name === "TimeoutError" || name === "AbortError";
}

function observe(event: AiHttpEvent, log?: (event: AiHttpEvent) => void) {
  if (log) {
    log(event);
    return;
  }
  console.error(JSON.stringify({ scope: "ai.carga360", ...event }));
}

/** POST JSON. Reintenta 429 y 5xx con espera creciente. No reintenta 401 ni otros 4xx. */
export async function postJson<T>(input: JsonPost, deps: HttpClientDeps = {}): Promise<JsonOutcome<T>> {
  const attempts = deps.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("postJson requiere al menos un intento.");
  }
  const sleep = deps.sleep ?? defaultSleep;
  const baseDelayMs = deps.baseDelayMs ?? 1000;
  const jitterMs = deps.jitterMs ?? (() => 0);
  const call = deps.fetchImpl ?? fetch;
  let last: JsonOutcome<T> = { ok: false, status: null, attempts: 0, reason: "red" };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = Date.now();
    try {
      const response = await call(input.url, {
        method: "POST",
        headers: input.headers,
        body: input.body,
        signal: AbortSignal.timeout(input.timeoutMs),
      });
      const durationMs = Date.now() - started;
      if (response.ok) {
        const data = (await response.json().catch(() => null)) as T;
        observe({ step: "xai.chat", status: response.status, durationMs, attempt, outcome: "ok", reason: "ok" }, deps.log);
        return { ok: true, status: response.status, data, attempts: attempt };
      }
      const reason = "http" as const;
      const again = retryableStatus(response.status) && attempt < attempts;
      observe(
        { step: "xai.chat", status: response.status, durationMs, attempt, outcome: again ? "retry" : "fail", reason },
        deps.log,
      );
      last = { ok: false, status: response.status, attempts: attempt, reason };
      if (!again) return last;
    } catch (error) {
      const durationMs = Date.now() - started;
      const reason = isTimeout(error) ? "timeout" : "red";
      const again = attempt < attempts;
      observe(
        { step: "xai.chat", status: null, durationMs, attempt, outcome: again ? "retry" : "fail", reason },
        deps.log,
      );
      last = { ok: false, status: null, attempts: attempt, reason };
      if (!again) return last;
    }
    await sleep(baseDelayMs * 2 ** (attempt - 1) + jitterMs());
  }
  return last;
}
