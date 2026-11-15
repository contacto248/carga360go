import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { decideTextReply } from "../src/lib/assistant/reply";
import { countAiAttempts, listAiCalls } from "../src/lib/assistant/usage";
import { getDb } from "../src/lib/db";
import { setSetting } from "../src/lib/whatsapp/store";

const SECRET = "clave-de-prueba-no-real";
const PRIVATE = "persona@ejemplo.test";
const LEAK = "dato-personal-no-guardar";

function resetLog() {
  getDb().prepare(`DELETE FROM ai_call_log`).run();
}

function enableCalls(limit: number) {
  delete process.env.AI_CALLS_ENABLED;
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = SECRET;
  delete process.env.GEMINI_MODEL;
  setSetting("ai_calls_enabled", "on");
  setSetting("ai_daily_call_limit", String(limit));
  resetLog();
}

function jsonReply(content: string, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return {
    choices: [{ message: { content } }],
    ...(usage ? { usage } : {}),
  };
}

function okFetch(content: string, calls: { n: number }, usage?: { prompt_tokens: number; completion_tokens: number }): typeof fetch {
  return (async () => {
    calls.n += 1;
    return { ok: true, status: 200, json: async () => jsonReply(content, usage), text: async () => "" } as Response;
  }) as typeof fetch;
}

function child(mode: string): Promise<string> {
  const tsx = path.join(process.cwd(), "node_modules/.bin/tsx");
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return new Promise((resolve, reject) => {
    const proc = spawn(tsx, ["tests/ai-consumo-hijo.ts", mode], { env, cwd: process.cwd() });
    let out = "";
    let err = "";
    proc.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    proc.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || out))));
  });
}

test("apagada: no llama y la respuesta sale de las reglas", async () => {
  enableCalls(5);
  setSetting("ai_calls_enabled", "off");
  const calls = { n: 0 };
  const decision = await decideTextReply("hola", [], "web", { fetchImpl: okFetch("no debe usarse", calls) });
  assert.equal(calls.n, 0);
  assert.equal(decision.aiAttempt, "omitido");
  assert.equal(decision.fallbackReason, "apagada");
  assert.equal(decision.engine.endsWith(":fallo"), false);
  assert.equal(countAiAttempts(), 0);
  assert.equal(listAiCalls().some((row) => row.status === "skipped" && row.fallbackReason === "apagada"), true);
});

test("el cupo se reserva antes de llamar y el siguiente intento no sale", async () => {
  enableCalls(1);
  const calls = { n: 0 };
  const first = await decideTextReply("hola", [{ direction: "in", body: `mi correo es ${PRIVATE}` }], "web", {
    fetchImpl: okFetch("Puede ver las cargas en el sitio.", calls, { prompt_tokens: 12, completion_tokens: 7 }),
  });
  const second = await decideTextReply("hola de nuevo", [], "web", { fetchImpl: okFetch("segunda", calls) });
  assert.equal(calls.n, 1);
  assert.equal(first.aiAttempt, "ok");
  assert.equal(first.engine.startsWith("ia:"), true);
  assert.equal(second.aiAttempt, "omitido");
  assert.equal(second.fallbackReason, "limite");
  assert.match(second.engine, /^reglas:/);
  assert.equal(second.engine.includes(":fallo"), false);
  const rows = listAiCalls();
  const ok = rows.find((row) => row.status === "ok");
  assert.equal(ok?.promptTokens, 12);
  assert.equal(ok?.completionTokens, 7);
  assert.equal(ok?.provider, "gemini");
  assert.equal(ok?.model, "gemini-3.5-flash-lite");
  assert.equal(JSON.stringify(rows).includes(PRIVATE), false);
  assert.equal(JSON.stringify(rows).includes(SECRET), false);
  assert.equal(countAiAttempts(), 1);
});

test("ocho reservas simultáneas no superan el cupo de tres", async () => {
  enableCalls(3);
  const results = await Promise.all(Array.from({ length: 8 }, () => child("reservar")));
  assert.equal(results.filter((item) => item === "reserved").length, 3);
  assert.equal(results.filter((item) => item === "limite").length, 5);
  assert.equal(countAiAttempts(), 3);
});

test("un proceso nuevo ve el cupo ya reservado", async () => {
  enableCalls(5);
  assert.equal(await child("reservar"), "reserved");
  assert.equal(await child("contar"), "1");
  assert.equal(countAiAttempts(), 1);
});

test("un error del proveedor queda como intento fallido y no guarda el cuerpo", async () => {
  enableCalls(5);
  const calls = { n: 0 };
  const fetchImpl = (async () => {
    calls.n += 1;
    return { ok: false, status: 429, text: async () => LEAK, json: async () => ({}) } as Response;
  }) as typeof fetch;
  const decision = await decideTextReply("hola", [{ direction: "in", body: PRIVATE }], "web", { fetchImpl });
  assert.equal(calls.n, 1);
  assert.equal(decision.aiAttempt, "fallido");
  assert.equal(decision.fallbackReason, "http");
  assert.match(decision.engine, /:fallo$/);
  const row = listAiCalls().find((item) => item.status === "error");
  assert.equal(row?.fallbackReason, "http");
  assert.equal(JSON.stringify(listAiCalls()).includes(LEAK), false);
  assert.equal(JSON.stringify(listAiCalls()).includes(PRIVATE), false);
  assert.equal(countAiAttempts(), 1);
});

test("un timeout cuenta como intento y no como llamada omitida", async () => {
  enableCalls(5);
  const fetchImpl = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const fail = () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
      };
      const timer = setTimeout(fail, 200);
      if (init?.signal?.aborted) fail();
      else init?.signal?.addEventListener("abort", fail, { once: true });
    })) as typeof fetch;
  const decision = await decideTextReply("hola", [], "web", { fetchImpl, timeoutMs: 30 });
  assert.equal(decision.aiAttempt, "fallido");
  assert.equal(decision.fallbackReason, "timeout");
  assert.match(decision.engine, /:fallo$/);
  const row = listAiCalls().find((item) => item.status === "timeout");
  assert.ok(row);
  assert.equal(countAiAttempts(), 1);
});
