import assert from "node:assert/strict";
import { createRequire } from "node:module";
import net from "node:net";
import { test } from "node:test";
import {
  SENTRY_TRACES_SAMPLE_RATE,
  buildSentryOptions,
  scrubSentryEvent,
  sentryEnabled,
  type ScrubbableEvent,
} from "../src/lib/sentry/options";

const FAKE_DSN = "https://00000000000000000000000000000000@o0.ingest.sentry.io/0";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) previous.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("sin SENTRY_DSN el SDK queda desactivado, también durante el build", () => {
  withEnv(
    {
      SENTRY_DSN: undefined,
      NEXT_PUBLIC_SENTRY_DSN: undefined,
      SENTRY_ENVIRONMENT: undefined,
      NEXT_PHASE: undefined,
      npm_lifecycle_event: undefined,
    },
    () => {
      assert.equal(sentryEnabled(), false);
      assert.equal(buildSentryOptions(), null);
    },
  );
  withEnv({ SENTRY_DSN: FAKE_DSN, NEXT_PHASE: "phase-production-build", npm_lifecycle_event: undefined }, () => {
    assert.equal(sentryEnabled(), false);
    assert.equal(buildSentryOptions(), null);
  });
});

test("con DSN ficticio solo hay captura de errores, sin PII ni replay", () => {
  withEnv({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "staging", NEXT_PHASE: undefined, npm_lifecycle_event: "test" }, () => {
    const options = buildSentryOptions();
    assert.ok(options);
    assert.equal(options.dsn, FAKE_DSN);
    assert.equal(options.enabled, true);
    assert.equal(options.environment, "staging");
    assert.equal(options.sendDefaultPii, false);
    assert.equal(options.tracesSampleRate, SENTRY_TRACES_SAMPLE_RATE);
    assert.equal(SENTRY_TRACES_SAMPLE_RATE, 0.05);
    assert.equal(options.replaysSessionSampleRate, 0);
    assert.equal(options.replaysOnErrorSampleRate, 0);
    assert.equal(options.tunnel, undefined);
    const collection = options.dataCollection as {
      userInfo: boolean;
      cookies: boolean;
      httpHeaders: boolean;
      httpBodies: string[];
    };
    assert.equal(collection.userInfo, false);
    assert.equal(collection.cookies, false);
    assert.equal(collection.httpHeaders, false);
    assert.deepEqual(collection.httpBodies, []);
  });
});

test("beforeSend quita cookies, headers de auth y tokens", () => {
  const event: ScrubbableEvent = {
    request: {
      url: "https://www.carga360go.cl/admin/control?company=carga360go&token=secreto&ok=1",
      headers: {
        cookie: "c360_session=abc",
        authorization: "Bearer abc.def",
        "x-api-key": "clave",
        "x-carga360-secret": "otro",
        accept: "application/json",
        "x-custom": "Bearer abc",
      },
      cookies: { c360_session: "abc" },
      query_string: "token=secreto&ok=1",
    },
    breadcrumbs: [{ data: { url: "https://www.carga360go.cl/api?password=clave", headers: { cookie: "a" }, cookie: "a" } }],
  };
  const clean = scrubSentryEvent(event);
  const headers = clean.request?.headers ?? {};
  assert.equal(headers.cookie, undefined);
  assert.equal(headers.authorization, undefined);
  assert.equal(headers["x-api-key"], undefined);
  assert.equal(headers["x-carga360-secret"], undefined);
  assert.equal(headers["x-custom"], undefined);
  assert.equal(headers.accept, "application/json");
  assert.equal(clean.request?.cookies, undefined);
  assert.equal(clean.request?.url, "https://www.carga360go.cl/admin/control?company=carga360go&token=%5Bfiltrado%5D&ok=1");
  assert.equal(clean.request?.query_string, "token=%5Bfiltrado%5D&ok=1");
  assert.equal(clean.breadcrumbs?.[0]?.data?.url, "https://www.carga360go.cl/api?password=%5Bfiltrado%5D");
  assert.equal(clean.breadcrumbs?.[0]?.data?.headers, undefined);
  assert.equal(clean.breadcrumbs?.[0]?.data?.cookie, undefined);
});

test("register sin DSN no carga @sentry/nextjs ni abre red", async () => {
  const calls: string[] = [];
  const require = createRequire(import.meta.url);
  const originalFetch = globalThis.fetch;
  const originalConnect = net.Socket.prototype.connect;
  globalThis.fetch = ((input: unknown) => {
    calls.push(`fetch ${String(input)}`);
    throw new Error("red");
  }) as typeof fetch;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: Parameters<typeof originalConnect>) {
    calls.push("socket");
    return originalConnect.apply(this, args);
  } as typeof originalConnect;
  const previousDsn = process.env.SENTRY_DSN;
  const previousPublic = process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  try {
    const mod = await import("../src/instrumentation");
    await mod.register();
    await mod.onRequestError(
      new Error("qa"),
      { path: "/", method: "GET", headers: { cookie: "a" } },
      { routerKind: "App Router", routePath: "/", routeType: "render" },
    );
    assert.equal(require.cache[require.resolve("@sentry/nextjs")], undefined);
    assert.deepEqual(calls, []);
  } finally {
    globalThis.fetch = originalFetch;
    net.Socket.prototype.connect = originalConnect;
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = previousPublic;
  }
});
