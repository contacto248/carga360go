import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { GET, POST } from "../src/app/api/chat/route";
import { GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_TIMEOUT_MS, GEMINI_OPENAI_BASE, aiConfig, aiReady } from "../src/lib/assistant/config";
import { AI_FALLBACK_REPLY } from "../src/lib/assistant/reply";
import { CHAT_COOKIE, CHAT_MAX_MESSAGE, setWebChatEnabled, webChatEnabled } from "../src/lib/chat/config";
import { getDb } from "../src/lib/db";
import { resetRateLimits } from "../src/lib/rate-limit";
import { systemPrompt } from "../src/lib/assistant/prompt";
import { whatsappContactHref } from "../src/lib/format";
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

const VALID_CONTACT = { name: "Ana Pérez", phone: "+56 9 1234 5678" };

async function postChat(message: string, cookie?: string, extra: RequestInit = {}, contact: { name: string; phone: string } | null = VALID_CONTACT) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(extra.headers as Record<string, string> | undefined) };
  if (cookie) headers.cookie = cookie;
  const body: Record<string, unknown> = {};
  if (message) body.message = message;
  if (contact) body.contact = contact;
  const response = await POST(
    new Request("http://127.0.0.1:4317/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
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

test("Gemini: modelo por defecto gemini-3.5-flash-lite, GEMINI_MODEL y timeout de 25 s", () => {
  clearAiEnv();
  assert.equal(aiReady(), false);
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  const cfg = aiConfig();
  assert.equal(cfg.provider, "gemini");
  assert.equal(cfg.model, GEMINI_DEFAULT_MODEL);
  assert.equal(cfg.model, "gemini-3.5-flash-lite");
  assert.equal(cfg.baseUrl, GEMINI_OPENAI_BASE);
  assert.equal(cfg.timeoutMs, GEMINI_DEFAULT_TIMEOUT_MS);
  assert.equal(cfg.timeoutMs, 25_000);
  assert.equal(cfg.key, "clave-de-prueba");

  process.env.GEMINI_MODEL = "gemini-otro";
  assert.equal(aiConfig().model, "gemini-otro");

  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  process.env.AI_API_KEY = "openai-key";
  const open = aiConfig();
  assert.equal(open.provider, "openai");
  assert.equal(open.model, "gpt-4o-mini");
  assert.equal(open.baseUrl, "https://api.openai.com/v1");
  clearAiEnv();
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
  const precio = ruleReply("precio", live, "web");
  assert.match(precio, /peajes/i);
  assert.match(precio, /di[eé]sel/i);
  assert.match(precio, /costo real del flete/i);
  assert.doesNotMatch(precio, /comisi[oó]n|membres[ií]a|30 d[ií]as gratis|Mercado Pago/i);
  const prompt = systemPrompt(live, "web");
  assert.match(prompt, /peajes/i);
  assert.doesNotMatch(prompt, /comisi[oó]n por el flete|30 d[ií]as gratis|CAMPAIGN_|Mercado Pago/i);
  assert.match(ruleReply("publicar_carga", live, "web"), /cargas\/nueva/);
  assert.match(ruleReply("registro_transportista", live, "web"), /registro/);
  assert.doesNotMatch(ruleReply("humano", live, "web"), /wa\.me\//);
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
  assert.match(String(second.data.reply), /cargas\/nueva/);
  assert.doesNotMatch(String(second.data.reply), /gratis|comisi[oó]n|membres[ií]a/i);
  const messages = second.data.messages as { role: string; text: string }[];
  assert.ok(messages.length >= 4);
  assert.equal(messages.some((m) => m.role === "user" && /empresa/.test(m.text)), true);

  const prices = await postChat("Precios", cookie);
  assert.match(String(prices.data.reply), /peajes/i);
  assert.doesNotMatch(String(prices.data.reply), /comisi[oó]n|membres[ií]a|30 d[ií]as gratis/i);

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

test("el chat exige nombre y celular chileno y no se puede saltar desde el cliente", async () => {
  clearAiEnv();
  enableChat();
  const before = (getDb().prepare(`SELECT COUNT(*) AS n FROM web_chat_messages`).get() as { n: number }).n;
  const missing = await postChat("Hola", undefined, {}, null);
  assert.equal(missing.response.status, 400);
  assert.match(String(missing.data.error), /celular/i);
  const shortName = await postChat("Hola", undefined, {}, { name: "A", phone: "+56 9 1234 5678" });
  assert.equal(shortName.response.status, 400);
  assert.match(String(shortName.data.error), /nombre/i);
  const landline = await postChat("Hola", undefined, {}, { name: "Ana Pérez", phone: "+56 2 2123 4567" });
  assert.equal(landline.response.status, 400);
  assert.match(String(landline.data.error), /celular/i);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM web_chat_messages`).get() as { n: number }).n, before);

  const saved = await postChat("", undefined, {}, { name: "  Ana   Pérez ", phone: "9 1234 5678" });
  assert.equal(saved.response.status, 200);
  assert.equal((saved.data.visitor as { name: string }).name, "Ana Pérez");
  assert.equal((saved.data.visitor as { phone: string }).phone, "56912345678");
  const cookie = cookieFrom(saved.response);
  assert.ok(cookie);
  const next = await postChat("Soy empresa con carga", cookie, {}, null);
  assert.equal(next.response.status, 200);
  assert.match(String(next.data.reply), /cargas\/nueva/);

  const href = whatsappContactHref("56958428693", "Hola, quiero información de Carga360go.", "Ana Pérez", "+56 9 1234 5678");
  assert.ok(href?.startsWith("https://wa.me/56958428693?text="));
  const text = decodeURIComponent(href!.split("text=")[1] || "");
  assert.match(text, /Nombre: Ana Pérez/);
  assert.match(text, /Celular: \+56 9 1234 5678/);
  assert.equal(whatsappContactHref("56958428693", "Hola", "A", "912345678"), null);
  assert.equal(whatsappContactHref("56958428693", "Hola", "Ana Pérez", "+56 2 2123 4567"), null);

  setWebChatEnabled(false);
  resetRateLimits();
});
