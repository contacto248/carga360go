import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { GET, POST } from "../src/app/api/chat/route";
import { aiReply } from "../src/lib/assistant/ai";
import { GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_TIMEOUT_MS, GEMINI_OPENAI_BASE, aiConfig, aiReady } from "../src/lib/assistant/config";
import { AI_FALLBACK_REPLY } from "../src/lib/assistant/reply";
import { CHAT_COOKIE, CHAT_MAX_MESSAGE, setWebChatEnabled, webChatEnabled } from "../src/lib/chat/config";
import { getDb } from "../src/lib/db";
import { resetRateLimits } from "../src/lib/rate-limit";
import { detectIntent, ruleReply } from "../src/lib/whatsapp/intents";
import { setSetting } from "../src/lib/whatsapp/store";

function clearAiEnv() {
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  delete process.env.AI_TIMEOUT_MS;
}

function enableChat() {
  setWebChatEnabled(true);
  resetRateLimits();
}

const ctx = { params: Promise.resolve({}) };

async function postChat(message: string, cookie?: string, extra: RequestInit = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(extra.headers as Record<string, string> | undefined) };
  if (cookie) headers.cookie = cookie;
  const response = await POST(
    new Request("http://127.0.0.1:4317/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({ message }),
    }),
    ctx,
  );
  const data = (await response.json()) as Record<string, unknown>;
  return { response, data };
}

function cookieFrom(response: Response): string | undefined {
  const raw = response.headers.get("set-cookie") || "";
  const match = raw.match(new RegExp(`${CHAT_COOKIE}=([^;]+)`));
  return match ? `${CHAT_COOKIE}=${match[1]}` : undefined;
}

test("GEMINI_API_KEY usa Gemini; AI_API_KEY y gpt-4o-mini no eligen OpenAI", async () => {
  clearAiEnv();
  assert.equal(aiReady(), false);

  process.env.AI_PROVIDER = "openai";
  process.env.AI_API_KEY = "openai-key";
  process.env.AI_MODEL = "gpt-4o-mini";
  process.env.AI_BASE_URL = "https://api.openai.com/v1";
  assert.equal(aiReady(), false);
  const blocked = aiConfig();
  assert.equal(blocked.provider, "gemini");
  assert.equal(blocked.key, "");
  assert.equal(blocked.model, GEMINI_DEFAULT_MODEL);
  assert.equal(blocked.model, "gemini-3.5-flash-lite");
  assert.equal(blocked.baseUrl, GEMINI_OPENAI_BASE);

  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  const cfg = aiConfig();
  assert.equal(aiReady(), true);
  assert.equal(cfg.provider, "gemini");
  assert.equal(cfg.model, "gemini-3.5-flash-lite");
  assert.equal(cfg.baseUrl, GEMINI_OPENAI_BASE);
  assert.equal(cfg.baseUrl.includes("api.openai.com"), false);
  assert.equal(cfg.timeoutMs, GEMINI_DEFAULT_TIMEOUT_MS);
  assert.equal(cfg.timeoutMs, 25_000);
  assert.equal(cfg.key, "clave-de-prueba");

  let url = "";
  let sentModel = "";
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    url = String(input);
    sentModel = String(JSON.parse(String(init?.body)).model);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Puede ver las cargas en el sitio." } }] }),
    } as Response;
  }) as typeof fetch;
  const outcome = await aiReply([], "hola", { activeLoads: 0, activeTrucks: 0, recentLoads: [], recentTrucks: [] }, "web", { fetchImpl });
  assert.equal(outcome.attempt, "ok");
  assert.equal(url, `${GEMINI_OPENAI_BASE}/chat/completions`);
  assert.equal(sentModel, "gemini-3.5-flash-lite");
  assert.equal(outcome.result?.engine, "ia:gemini:gemini-3.5-flash-lite");

  process.env.GEMINI_MODEL = "gemini-otro";
  assert.equal(aiConfig().model, "gemini-otro");
  process.env.AI_TIMEOUT_MS = "18000";
  assert.equal(aiConfig().timeoutMs, 18_000);
  clearAiEnv();
  assert.equal(aiReady(), false);
});

test("El chat web está apagado por defecto y no expone secretos", async () => {
  clearAiEnv();
  setSetting("web_chat_enabled", "off");
  delete process.env.WEB_CHAT_ENABLED;
  assert.equal(webChatEnabled(), false);
  const disabled = await GET(new Request("http://127.0.0.1:4317/api/chat"), ctx);
  const off = (await disabled.json()) as Record<string, unknown>;
  assert.equal(disabled.status, 200);
  assert.equal(off.enabled, false);
  const { response, data } = await postChat("hola");
  assert.equal(response.status, 503);
  const raw = JSON.stringify(data);
  assert.equal(/GEMINI_API_KEY|AI_API_KEY|clave-de-prueba|sk-/.test(raw), false);
  assert.match(String(data.error), /no está disponible/i);
});

test("Motor de reglas del chat: empresa, transportista, precios y persona", () => {
  assert.equal(detectIntent("Soy empresa con carga"), "publicar_carga");
  assert.equal(detectIntent("Soy transportista"), "registro_transportista");
  assert.equal(detectIntent("Precios"), "precio");
  assert.equal(detectIntent("Quiero hablar con una persona"), "humano");
  const live = { activeLoads: 1, activeTrucks: 0, recentLoads: [], recentTrucks: [] };
  assert.match(ruleReply("precio", live, "web"), /30 días gratis/i);
  assert.match(ruleReply("precio", live, "web"), /comisi[oó]n/i);
  assert.match(ruleReply("publicar_carga", live, "web"), /cargas\/nueva/);
  assert.match(ruleReply("registro_transportista", live, "web"), /registro/);
  assert.match(ruleReply("humano", live, "web"), /wa\.me\/56958428693/);
  assert.match(ruleReply("humano", live, "web"), /contacto@carga360go\.cl/);
  assert.match(ruleReply("saludo", live, "web"), /asistente virtual/i);
  assert.match(AI_FALLBACK_REPLY, /contacto@carga360go\.cl/);
});

test("POST /api/chat: sesión, historial, límites y derivación a humano", async () => {
  clearAiEnv();
  enableChat();
  const first = await postChat("Hola");
  assert.equal(first.response.status, 200);
  assert.equal(first.data.enabled, true);
  assert.match(String(first.data.reply), /Carga 360 Go/);
  assert.equal(typeof first.data.conversationId, "string");
  const cookie = cookieFrom(first.response);
  assert.ok(cookie);

  const second = await postChat("Soy empresa con carga", cookie);
  assert.equal(second.response.status, 200);
  assert.equal(second.data.conversationId, first.data.conversationId);
  assert.match(String(second.data.reply), /gratis/i);
  const messages = second.data.messages as { role: string; text: string }[];
  assert.ok(messages.length >= 4);
  assert.equal(messages.some((m) => m.role === "user" && /empresa/.test(m.text)), true);

  const prices = await postChat("Precios", cookie);
  assert.match(String(prices.data.reply), /30 días gratis/i);

  const human = await postChat("Quiero hablar con una persona", cookie);
  assert.equal(human.data.handoff, true);
  const contacts = human.data.contacts as { email: string; whatsappUrl: string };
  assert.equal(contacts.email, "contacto@carga360go.cl");
  assert.equal(contacts.whatsappUrl, "https://wa.me/56958428693");
  assert.match(String(human.data.reply), /contacto@carga360go\.cl/);

  const tooLong = await postChat("x".repeat(CHAT_MAX_MESSAGE + 1), cookie);
  assert.equal(tooLong.response.status, 400);

  const raw = JSON.stringify(human.data);
  assert.equal(/GEMINI_API_KEY|AI_API_KEY|engine/.test(raw), false);

  const history = await GET(new Request("http://127.0.0.1:4317/api/chat", { headers: { cookie: cookie! } }), ctx);
  const hist = (await history.json()) as { messages: unknown[] };
  assert.ok(hist.messages.length >= 6);

  const tables = getDb()
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('web_chat_conversations', 'web_chat_messages') ORDER BY name`)
    .all() as { name: string }[];
  assert.deepEqual(
    tables.map((t) => t.name),
    ["web_chat_conversations", "web_chat_messages"],
  );

  setWebChatEnabled(false);
  resetRateLimits();
});

test("POST /api/chat respeta el límite por sesión", async () => {
  clearAiEnv();
  enableChat();
  const first = await postChat("Hola");
  const cookie = cookieFrom(first.response)!;
  let lastStatus = 200;
  for (let i = 0; i < 25; i += 1) {
    const result = await postChat(`consulta ${i}`, cookie);
    lastStatus = result.response.status;
    if (lastStatus === 429) break;
  }
  assert.equal(lastStatus, 429);
  setWebChatEnabled(false);
  resetRateLimits();
});
