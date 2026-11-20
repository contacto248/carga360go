import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import { POST } from "../src/app/api/ai/v1/orchestrate/route";
import { aiRouterEnabled, dailySpendCapUsd, readRouterEnv } from "../src/lib/ai-router/config";
import { orchestrate } from "../src/lib/ai-router/orchestrator";
import { estimateCost, providerOrder } from "../src/lib/ai-router/providers";
import { sessionActor } from "../src/lib/ai-router/session";
import { getDb } from "../src/lib/db";
import { resetRateLimits } from "../src/lib/rate-limit";
import { makeAdmin, person } from "./helpers-agente";

const KEYS = [
  "AI_ROUTER_ENABLED",
  "OPENAI_API_KEY",
  "XAI_API_KEY",
  "OPENAI_MODEL",
  "XAI_MODEL",
  "PROVIDER_TIMEOUT_SECONDS",
  "OPENAI_INPUT_USD_PER_M",
  "OPENAI_OUTPUT_USD_PER_M",
  "XAI_INPUT_USD_PER_M",
  "XAI_OUTPUT_USD_PER_M",
  "AI_ROUTER_DAILY_USD",
  "AI_ROUTER_USER_LIMIT",
  "AI_ROUTER_TENANT_LIMIT",
] as const;

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = async () => {
    throw new Error("red-prohibida");
  };
});

after(() => {
  globalThis.fetch = realFetch;
});

function marker(label: string): string {
  return `${label}-${randomBytes(18).toString("hex")}`;
}

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const previous = new Map<string, string | undefined>();
  for (const name of KEYS) previous.set(name, process.env[name]);
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  const finish = () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  try {
    const result = run();
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(finish);
    }
    finish();
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("el tope diario por defecto es 5 USD", () => {
  for (const value of [undefined, "", "no", "-1", "101"]) {
    withEnv({ AI_ROUTER_DAILY_USD: value }, () => {
      assert.equal(dailySpendCapUsd(), 5, String(value));
    });
  }
  withEnv({ AI_ROUTER_DAILY_USD: "5" }, () => {
    assert.equal(dailySpendCapUsd(), 5);
  });
  const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  assert.match(example, /^AI_ROUTER_DAILY_USD=5$/m);
  assert.match(example, /^AI_ROUTER_ENABLED=false$/m);
});

test("el flag solo se enciende con el texto exacto true", () => {
  for (const value of [undefined, "", "1", "TRUE", "True", " true", "true ", "yes", "false"]) {
    withEnv({ AI_ROUTER_ENABLED: value }, () => {
      assert.equal(aiRouterEnabled(), false, String(value));
    });
  }
  withEnv({ AI_ROUTER_ENABLED: "true" }, () => {
    assert.equal(aiRouterEnabled(), true);
  });
});

test("auto ordena por la suma de precios y el empate deja OpenAI primero", () => {
  withEnv(
    {
      OPENAI_API_KEY: marker("oa"),
      XAI_API_KEY: marker("xa"),
      OPENAI_INPUT_USD_PER_M: "1",
      OPENAI_OUTPUT_USD_PER_M: "1",
      XAI_INPUT_USD_PER_M: "0.1",
      XAI_OUTPUT_USD_PER_M: "0.1",
    },
    () => {
      assert.deepEqual(providerOrder(readRouterEnv()), ["xai", "openai"]);
    },
  );
  withEnv(
    {
      OPENAI_API_KEY: marker("oa"),
      XAI_API_KEY: marker("xa"),
      OPENAI_INPUT_USD_PER_M: "1",
      OPENAI_OUTPUT_USD_PER_M: "1",
      XAI_INPUT_USD_PER_M: "1",
      XAI_OUTPUT_USD_PER_M: "1",
    },
    () => {
      assert.deepEqual(providerOrder(readRouterEnv()), ["openai", "xai"]);
    },
  );
  withEnv({ OPENAI_API_KEY: undefined, XAI_API_KEY: marker("xa") }, () => {
    assert.deepEqual(providerOrder(readRouterEnv()), ["xai"]);
  });
  assert.equal(estimateCost(1_000_000, 0, 0.25, 2), 0.25);
});

test("la sesión manda el usuario y el tenant; el cuerpo no", () => {
  assert.deepEqual(sessionActor({ id: "usuario-sesion-1", tenantId: "tenant-real" }), {
    userId: "usuario-sesion-1",
    tenantId: "tenant-real",
  });
  assert.deepEqual(sessionActor({ id: "usuario-sesion-1" }), { userId: "usuario-sesion-1", tenantId: null });
  assert.equal(sessionActor({ id: "usuario-sesion-1", tenantId: "con espacio" }).tenantId, null);
});

test("con el flag apagado la ruta responde 404 JSON y no llama a la red", async () => {
  await withEnv({ AI_ROUTER_ENABLED: undefined }, async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/ai/v1/orchestrate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": "falso", "x-user-id": "falso" },
        body: JSON.stringify({ prompt: "hola", provider: "both", tenant_id: "falso", user_id: "falso" }),
      }),
    );
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    assert.deepEqual(await response.json(), { error: "No encontrado." });
  });
});

test("con el flag encendido y sin sesión responde 401", async () => {
  await withEnv({ AI_ROUTER_ENABLED: "true" }, async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/ai/v1/orchestrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "hola" }),
      }),
    );
    assert.equal(response.status, 401);
  });
});

test("auto usa el proveedor más barato, calcula el coste y no guarda la clave", async () => {
  const openaiKey = marker("oa");
  const xaiKey = marker("xa");
  const { user, token } = makeAdmin(person("mandante", "router").user);
  const seen: string[] = [];
  const impl: typeof fetch = async (input, init) => {
    seen.push(String(input));
    const parsed = JSON.parse(String(init?.body));
    assert.equal(parsed.store, false);
    assert.equal(parsed.max_output_tokens, 1200);
    return jsonResponse({
      id: "resp-x",
      output: [{ content: [{ type: "output_text", text: `ok ${xaiKey}` }, { type: "note", text: "oculto" }] }],
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });
  };
  await withEnv(
    {
      AI_ROUTER_ENABLED: "true",
      OPENAI_API_KEY: openaiKey,
      XAI_API_KEY: xaiKey,
      XAI_INPUT_USD_PER_M: "0.1",
      XAI_OUTPUT_USD_PER_M: "0.1",
      OPENAI_INPUT_USD_PER_M: "9",
      OPENAI_OUTPUT_USD_PER_M: "9",
    },
    async () => {
      const previous = globalThis.fetch;
      globalThis.fetch = impl;
      try {
        const response = await POST(
          new Request("http://127.0.0.1/api/ai/v1/orchestrate", {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
              "x-tenant-id": "header-falso",
              "x-user-id": "header-falso",
            },
            body: JSON.stringify({ prompt: "cotiza el flete", tenant_id: "body-falso", user_id: "body-falso" }),
          }),
        );
        const body = (await response.json()) as {
          provider: string;
          fallback_used: boolean;
          tenant_id: string | null;
          user_id: string;
          text: string;
          estimated_cost_usd: number;
          trace_id: string;
        };
        assert.equal(response.status, 200);
        assert.deepEqual(seen, ["https://api.x.ai/v1/responses"]);
        assert.equal(body.provider, "xai");
        assert.equal(body.fallback_used, false);
        assert.equal(body.tenant_id, null);
        assert.equal(body.user_id, user.id);
        assert.equal(body.text, "ok ");
        assert.equal(body.estimated_cost_usd, 0.1);
        assert.equal(JSON.stringify(body).includes(xaiKey), false);
        assert.equal(JSON.stringify(body).includes(openaiKey), false);
        const row = getDb().prepare(`SELECT provider, model, mode, input_tokens, cost_usd, fallback_used, result, tenant_id, user_id FROM ai_router_usage WHERE trace_id = ?`).get(body.trace_id) as {
          provider: string;
          model: string;
          mode: string;
          input_tokens: number;
          cost_usd: number;
          fallback_used: number;
          result: string;
          tenant_id: string | null;
          user_id: string;
        };
        assert.equal(row.provider, "xai");
        assert.equal(row.model, "grok-4.7");
        assert.equal(row.mode, "auto");
        assert.equal(row.input_tokens, 1_000_000);
        assert.equal(row.cost_usd, 0.1);
        assert.equal(row.fallback_used, 0);
        assert.equal(row.result, "ok");
        assert.equal(row.tenant_id, null);
        assert.equal(row.user_id, user.id);
        assert.equal(JSON.stringify(row).includes(xaiKey), false);
      } finally {
        globalThis.fetch = previous;
      }
    },
  );
});

test("si el primero falla, auto cae al otro y both persiste las dos filas", async () => {
  const openaiKey = marker("oa");
  const xaiKey = marker("xa");
  let calls = 0;
  const impl: typeof fetch = async (input, init) => {
    calls += 1;
    const url = String(input);
    if (url.includes("api.x.ai")) {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }
    return jsonResponse({
      id: "resp-oa",
      output: [{ content: [{ type: "output_text", text: "openai" }] }],
      usage: { input_tokens: 4, output_tokens: 6 },
    });
  };
  const settings = {
    openaiKey,
    xaiKey,
    openaiModel: "gpt-5-mini",
    xaiModel: "grok-4.7",
    timeoutMs: 30,
    prices: { openai: { input: 9, output: 9 }, xai: { input: 0.1, output: 0.1 } },
  };
  const fallback = await orchestrate({
    prompt: "hola",
    provider: "auto",
    maxOutputTokens: 100,
    settings,
    fetchImpl: impl,
    traceId: "trace-fallback-0001",
  });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.provider, "openai");
  assert.equal(fallback.body.fallback_used, true);
  assert.equal(fallback.usage.length, 2);
  assert.equal(fallback.usage[0].provider, "xai");
  assert.equal(fallback.usage[0].result, "error");
  assert.equal(fallback.usage[0].errorCode, "Timeout");
  assert.equal(fallback.usage[1].fallbackUsed, true);
  assert.equal(calls, 2);

  let bothCalls = 0;
  const bothFetch: typeof fetch = async (input) => {
    bothCalls += 1;
    const url = String(input);
    return jsonResponse({
      id: url.includes("x.ai") ? "rx" : "ro",
      output: [{ content: [{ type: "output_text", text: url.includes("x.ai") ? "lado-x" : "lado-o" }] }],
      usage: { input_tokens: 2, output_tokens: 3 },
    });
  };
  const both = await orchestrate({
    prompt: "los dos",
    provider: "both",
    maxOutputTokens: 50,
    settings,
    fetchImpl: bothFetch,
    traceId: "trace-both-00000001",
  });
  assert.equal(both.status, 200);
  assert.equal(bothCalls, 2);
  const results = both.body.results as { openai: { text: string }; xai: { text: string } };
  assert.equal(results.openai.text, "lado-o");
  assert.equal(results.xai.text, "lado-x");
  assert.equal(both.usage.length, 2);
  assert.equal(both.usage.every((row) => row.mode === "both" && row.result === "ok" && row.fallbackUsed === false), true);
});

test("both con un proveedor sin clave persiste el error y la respuesta del otro", async () => {
  const openaiKey = marker("oa");
  const settings = {
    openaiKey,
    xaiKey: "",
    openaiModel: "gpt-5-mini",
    xaiModel: "grok-4.7",
    timeoutMs: 1000,
    prices: { openai: { input: 0.25, output: 2 }, xai: { input: 2, output: 6 } },
  };
  const seen: string[] = [];
  const impl: typeof fetch = async (input) => {
    seen.push(String(input));
    return jsonResponse({
      id: "ro",
      output: [{ content: [{ type: "output_text", text: "solo-openai" }] }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  };
  const outcome = await orchestrate({
    prompt: "both",
    provider: "both",
    maxOutputTokens: 20,
    settings,
    fetchImpl: impl,
    traceId: "trace-both-parcial1",
  });
  assert.deepEqual(seen, ["https://api.openai.com/v1/responses"]);
  const results = outcome.body.results as { openai: { text: string }; xai: { error: string } };
  assert.equal(results.openai.text, "solo-openai");
  assert.equal(results.xai.error, "ProviderDisabled");
  assert.equal(outcome.usage[1].result, "error");
  assert.equal(outcome.usage[1].errorCode, "ProviderDisabled");
  assert.equal(JSON.stringify(outcome).includes(openaiKey), false);
});

function providerOk(text: string): Response {
  return jsonResponse({
    id: "resp-ok",
    output: [{ content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

function postAs(token: string, prompt: string): Promise<Response> {
  return POST(
    new Request("http://127.0.0.1/api/ai/v1/orchestrate", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    }),
  );
}

test("un rol interno con permiso ai.execute puede orquestar", async () => {
  resetRateLimits();
  const { token } = makeAdmin(person("mandante", "router-interno").user);
  let calls = 0;
  const impl: typeof fetch = async () => {
    calls += 1;
    return providerOk("interno");
  };
  await withEnv({ AI_ROUTER_ENABLED: "true", OPENAI_API_KEY: marker("oa"), XAI_API_KEY: marker("xa") }, async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = impl;
    try {
      const response = await postAs(token, "consulta interna");
      const body = (await response.json()) as { text: string };
      assert.equal(response.status, 200);
      assert.equal(body.text, "interno");
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = previous;
    }
  });
});

test("mandante con sesión recibe 403 y no llama al proveedor", async () => {
  const { token } = person("mandante", "router-mandante");
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return providerOk("no");
  };
  try {
    await withEnv({ AI_ROUTER_ENABLED: "true", OPENAI_API_KEY: marker("oa"), XAI_API_KEY: marker("xa") }, async () => {
      const response = await postAs(token, "hola");
      assert.equal(response.status, 403);
      assert.equal(calls, 0);
    });
  } finally {
    globalThis.fetch = previous;
  }
});

test("transportista con sesión recibe 403 y no llama al proveedor", async () => {
  const { token } = person("transportista", "router-carrier");
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return providerOk("no");
  };
  try {
    await withEnv({ AI_ROUTER_ENABLED: "true", OPENAI_API_KEY: marker("oa"), XAI_API_KEY: marker("xa") }, async () => {
      const response = await postAs(token, "hola");
      assert.equal(response.status, 403);
      assert.equal(calls, 0);
    });
  } finally {
    globalThis.fetch = previous;
  }
});

test("el límite de tasa corta por usuario y por tenant", async () => {
  const primero = makeAdmin(person("mandante", "router-tasa-a").user);
  const segundo = makeAdmin(person("mandante", "router-tasa-b").user);
  let calls = 0;
  const impl: typeof fetch = async () => {
    calls += 1;
    return providerOk("cupo");
  };
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    resetRateLimits();
    await withEnv(
      {
        AI_ROUTER_ENABLED: "true",
        OPENAI_API_KEY: marker("oa"),
        XAI_API_KEY: marker("xa"),
        AI_ROUTER_USER_LIMIT: "2",
        AI_ROUTER_TENANT_LIMIT: "50",
      },
      async () => {
        assert.equal((await postAs(primero.token, "uno")).status, 200);
        assert.equal((await postAs(primero.token, "dos")).status, 200);
        const blocked = await postAs(primero.token, "tres");
        const body = (await blocked.json()) as { error: string; code?: string };
        assert.equal(blocked.status, 429);
        assert.match(body.error, /Demasiados intentos/);
        assert.equal(body.code, undefined);
        assert.equal(calls, 2);
      },
    );

    resetRateLimits();
    calls = 0;
    await withEnv(
      {
        AI_ROUTER_ENABLED: "true",
        OPENAI_API_KEY: marker("oa"),
        XAI_API_KEY: marker("xa"),
        AI_ROUTER_USER_LIMIT: "10",
        AI_ROUTER_TENANT_LIMIT: "2",
      },
      async () => {
        assert.equal((await postAs(primero.token, "tenant-a")).status, 200);
        assert.equal((await postAs(segundo.token, "tenant-b")).status, 200);
        const blocked = await postAs(primero.token, "tenant-c");
        const body = (await blocked.json()) as { error: string };
        assert.equal(blocked.status, 429);
        assert.match(body.error, /Demasiados intentos/);
        assert.equal(calls, 2);
      },
    );
  } finally {
    globalThis.fetch = previous;
    resetRateLimits();
  }
});

test("el tope diario de gasto responde 429 y no llama al proveedor", async () => {
  resetRateLimits();
  const { user, token } = makeAdmin(person("mandante", "router-tope").user);
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO ai_router_usage (
        id, trace_id, user_id, tenant_id, provider, model, mode,
        input_tokens, output_tokens, cost_usd, latency_ms, fallback_used, result, error_code, created_at
      ) VALUES (?, ?, ?, NULL, 'openai', 'gpt-5-mini', 'auto', 1, 1, 1, 1, 0, 'ok', NULL, ?)`,
    )
    .run(`tope-${user.id}`, `trace-tope-${user.id.slice(0, 8)}`, user.id, stamp);
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return providerOk("no");
  };
  try {
    await withEnv(
      { AI_ROUTER_ENABLED: "true", OPENAI_API_KEY: marker("oa"), XAI_API_KEY: marker("xa"), AI_ROUTER_DAILY_USD: "1" },
      async () => {
        const response = await postAs(token, "otro");
        const body = (await response.json()) as { error: string; code: string };
        assert.equal(response.status, 429);
        assert.equal(body.code, "tope_diario");
        assert.match(body.error, /Tope diario/);
        assert.equal(calls, 0);
      },
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("un prompt de más de 20000 caracteres responde 400 y no llama al proveedor", async () => {
  resetRateLimits();
  const { token } = makeAdmin(person("mandante", "router-prompt").user);
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return providerOk("no");
  };
  try {
    await withEnv({ AI_ROUTER_ENABLED: "true", OPENAI_API_KEY: marker("oa"), XAI_API_KEY: marker("xa") }, async () => {
      const response = await postAs(token, "a".repeat(20_001));
      assert.equal(response.status, 400);
      assert.equal(calls, 0);
    });
  } finally {
    globalThis.fetch = previous;
  }
});

function postProvider(token: string, provider: "openai" | "xai"): Promise<Response> {
  return POST(
    new Request("http://127.0.0.1/api/ai/v1/orchestrate", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: "diagnostico", provider }),
    }),
  );
}

test("OpenAI 403 o UpstreamError guarda el error_code real sin secretos", async () => {
  resetRateLimits();
  const openaiKey = marker("oa");
  const xaiKey = marker("xa");
  const { token } = makeAdmin(person("mandante", "router-upstream").user);
  const logs: string[] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map((item) => (typeof item === "string" ? item : "")).join(" "));
  };
  const previous = globalThis.fetch;
  const stored = (traceId: string, provider: string) =>
    getDb().prepare(`SELECT error_code FROM ai_router_usage WHERE trace_id = ? AND provider = ?`).get(traceId, provider) as {
      error_code: string | null;
    };

  try {
    await withEnv({ AI_ROUTER_ENABLED: "true", OPENAI_API_KEY: openaiKey, XAI_API_KEY: undefined }, async () => {
      globalThis.fetch = async () =>
        jsonResponse(
          {
            error: {
              message: `Country, region, or territory not supported ${openaiKey}`,
              type: "request_forbidden",
              code: "unsupported_country_region_territory",
            },
          },
          403,
        );
      const forbidden = await postProvider(token, "openai");
      const forbiddenBody = (await forbidden.json()) as { trace_id: string; errors: { provider: string; error: string }[] };
      assert.equal(forbidden.status, 502);
      assert.equal(forbiddenBody.errors[0].provider, "openai");
      assert.equal(forbiddenBody.errors[0].error, "UpstreamError");
      assert.equal(JSON.stringify(forbiddenBody).includes(openaiKey), false);
      assert.equal(JSON.stringify(forbiddenBody).includes("unsupported_country_region_territory"), false);
      assert.equal(stored(forbiddenBody.trace_id, "openai").error_code, "unsupported_country_region_territory");
      assert.equal(logs.includes("[carga360go] ai-router openai status=403 error_code=unsupported_country_region_territory"), true);
      assert.equal(logs.join("\n").includes(openaiKey), false);
      assert.equal(logs.join("\n").includes("Country, region"), false);

      logs.length = 0;
      globalThis.fetch = async () => jsonResponse({ error: { code: "server_error", message: openaiKey } }, 500);
      const upstream = await postProvider(token, "openai");
      const upstreamBody = (await upstream.json()) as { trace_id: string };
      assert.equal(stored(upstreamBody.trace_id, "openai").error_code, "server_error");
      assert.equal(logs.includes("[carga360go] ai-router openai status=500 error_code=server_error"), true);
      assert.equal(logs.join("\n").includes(openaiKey), false);

      logs.length = 0;
      globalThis.fetch = async () => jsonResponse({ error: { code: null, type: "request_forbidden", message: openaiKey } }, 403);
      const typed = await postProvider(token, "openai");
      const typedBody = (await typed.json()) as { trace_id: string };
      assert.equal(stored(typedBody.trace_id, "openai").error_code, "request_forbidden");
      assert.equal(logs.join("\n").includes(openaiKey), false);

      logs.length = 0;
      globalThis.fetch = async () => new Response(`<html>${openaiKey}</html>`, { status: 403 });
      const html = await postProvider(token, "openai");
      const htmlBody = (await html.json()) as { trace_id: string };
      assert.equal(stored(htmlBody.trace_id, "openai").error_code, "http_403");
      assert.equal(logs.join("\n").includes(openaiKey), false);
      assert.equal(logs.join("\n").includes("<html>"), false);

      logs.length = 0;
      globalThis.fetch = async () => jsonResponse({ error: { code: openaiKey, message: `secret ${openaiKey}` } }, 403);
      const leaked = await postProvider(token, "openai");
      const leakedBody = (await leaked.json()) as { trace_id: string };
      const leakedRow = stored(leakedBody.trace_id, "openai");
      assert.equal(leakedRow.error_code, "http_403");
      assert.equal(JSON.stringify(leakedRow).includes(openaiKey), false);
      assert.equal(logs.join("\n").includes(openaiKey), false);

      logs.length = 0;
      globalThis.fetch = async () => jsonResponse({ error: { message: `la clave es ${openaiKey}` } }, 502);
      const plain = await postProvider(token, "openai");
      const plainBody = (await plain.json()) as { trace_id: string };
      assert.equal(stored(plainBody.trace_id, "openai").error_code, "UpstreamError");
      assert.equal(logs.join("\n").includes(openaiKey), false);
    });

    await withEnv({ AI_ROUTER_ENABLED: "true", OPENAI_API_KEY: undefined, XAI_API_KEY: xaiKey }, async () => {
      logs.length = 0;
      globalThis.fetch = async () => jsonResponse({ error: { code: "unsupported_country_region_territory", message: xaiKey } }, 403);
      const other = await postProvider(token, "xai");
      const otherBody = (await other.json()) as { trace_id: string };
      assert.equal(stored(otherBody.trace_id, "xai").error_code, "UpstreamError");
      assert.equal(logs.some((line) => line.includes("ai-router")), false);
      assert.equal(JSON.stringify(otherBody).includes(xaiKey), false);
    });
  } finally {
    console.error = previousError;
    globalThis.fetch = previous;
  }
});

test("la migración 032 es aditiva y su reversa no toca la 031", () => {
  const doc = fs.readFileSync(path.join(process.cwd(), "docs/migrations/032-ai-router-uso.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(process.cwd(), "docs/migrations/032-ai-router-uso-rollback.sql"), "utf8");
  assert.match(doc, /CREATE TABLE IF NOT EXISTS ai_router_usage/);
  assert.equal(/ALTER\s+TABLE\s+ops_alerts/i.test(doc), false);
  assert.match(rollback, /DELETE FROM schema_migrations WHERE version = 32/);
  assert.equal(/version = 31/.test(rollback), false);
  assert.equal(getDb().prepare(`SELECT 1 FROM schema_migrations WHERE version = 31`).get() != null, true);
  assert.equal(getDb().prepare(`SELECT 1 FROM schema_migrations WHERE version = 32`).get() != null, true);

  const raw = new Database(":memory:");
  raw.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  raw.exec(doc);
  raw.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (32, ?)`).run("2026-11-17T00:00:00.000Z");
  raw.prepare(
    `INSERT INTO ai_router_usage (
      id, trace_id, user_id, tenant_id, provider, model, mode, input_tokens, output_tokens, cost_usd, latency_ms, fallback_used, result, error_code, created_at
    ) VALUES ('fila', 'trace-rollback-01', 'usuario-1', NULL, 'openai', 'gpt-5-mini', 'auto', 0, 0, 0, 0, 0, 'ok', NULL, '2026-11-17T00:00:00.000Z')`,
  ).run();
  assert.throws(() => raw.prepare(`DELETE FROM ai_router_usage`).run());
  raw.exec(rollback);
  assert.equal(raw.prepare(`SELECT name FROM sqlite_master WHERE name = 'ai_router_usage'`).get(), undefined);
  assert.equal((raw.prepare(`SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 32`).get() as { n: number }).n, 0);
  raw.close();

  const dir = path.join(process.cwd(), "src/lib/ai-router");
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), "utf8");
    assert.equal(/sk-[A-Za-z0-9]{8,}/.test(source), false, name);
    if (name !== "usage-store.ts") assert.equal(/\bgetDb\b|better-sqlite3/.test(source), false, name);
  }
  const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  assert.match(example, /^OPENAI_API_KEY=\s*$/m);
  assert.match(example, /^XAI_API_KEY=\s*$/m);
});
