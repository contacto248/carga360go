import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
import { GET, POST } from "../src/app/api/whatsapp/webhook/route";
import { isSafeReply } from "../src/lib/whatsapp/ai";
import { processWebhookPayload, setSender } from "../src/lib/whatsapp/bot";
import { buildMessageRequest, canSend, WA_360_MESSAGES_URL, WA_360_WEBHOOK_HEADER } from "../src/lib/whatsapp/config";
import { detectIntent, ruleReply } from "../src/lib/whatsapp/intents";
import { getConversation, listConversations, listMessages, setSetting } from "../src/lib/whatsapp/store";
import { checkPost, validSignature, verifyChallenge } from "../src/lib/whatsapp/webhook";

const SECRET = "app-secret-de-prueba";
const sent: { to: string | null; text: string }[] = [];
let outSeq = 0;

function setEnv() {
  delete process.env.WA_PROVIDER;
  delete process.env.WA_360_API_KEY;
  delete process.env.WA_360_WEBHOOK_SECRET;
  process.env.WA_VERIFY_TOKEN = "token-verificacion-prueba";
  process.env.WA_APP_SECRET = SECRET;
  process.env.WA_PHONE_NUMBER_ID = "111";
  process.env.WA_ACCESS_TOKEN = "x";
  process.env.WA_BOT_ENABLED = "true";
  delete process.env.AI_API_KEY;
  setSender(async (to, text) => {
    sent.push({ to: to.waId, text });
    outSeq += 1;
    return { ok: true, wamid: `wamid.out.${outSeq}` };
  });
}

let seq = 0;
function inbound(from: string, body: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "111", display_phone_number: "56958428693" },
              contacts: [{ wa_id: from, profile: { name: "Cliente Prueba" } }],
              messages: [{ id: `wamid.in.${seq}`, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body }, ...extra }],
            },
          },
        ],
      },
    ],
  };
}

function echo(to: string, body: string) {
  seq += 1;
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "111", display_phone_number: "56958428693" },
              message_echoes: [{ from: "56958428693", to, id: `wamid.echo.${seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }],
            },
          },
        ],
      },
    ],
  };
}

test("GET de verificación: devuelve el challenge solo con el token correcto", async () => {
  setEnv();
  const ok = verifyChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "token-verificacion-prueba", "hub.challenge": "12345" }));
  assert.deepEqual(ok, { status: 200, body: "12345" });
  const bad = verifyChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "12345" }));
  assert.equal(bad.status, 403);
  const response = await GET(new Request("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=token-verificacion-prueba&hub.challenge=987"));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "987");
  delete process.env.WA_VERIFY_TOKEN;
  assert.equal(verifyChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" })).status, 503);
});

test("POST: firma X-Hub-Signature-256 inválida se rechaza; válida se acepta; sin secreto se ignora", async () => {
  setEnv();
  const raw = JSON.stringify(inbound("56911111111", "hola"));
  const good = "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
  assert.equal(validSignature(raw, good, SECRET), true);
  assert.equal(validSignature(raw, "sha256=" + "0".repeat(64), SECRET), false);
  assert.equal(validSignature(raw + " ", good, SECRET), false);
  assert.equal(validSignature(raw, null, SECRET), false);
  assert.equal(checkPost(raw, "sha256=deadbeef").status, 401);
  assert.equal(checkPost(raw, good).process, true);
  const response = await POST(new Request("http://x/api/whatsapp/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=" + "1".repeat(64) } }));
  assert.equal(response.status, 401);
  delete process.env.WA_APP_SECRET;
  const ignored = checkPost(raw, good);
  assert.equal(ignored.status, 200);
  assert.equal(ignored.process, false);
});

test("Motor de reglas: intenciones en español y respuestas sin precios ni marcas ajenas", () => {
  assert.equal(detectIntent("Hola buenas tardes"), "saludo");
  assert.equal(detectIntent("¿Cómo publico una carga de Santiago a Calama?"), "publicar_carga");
  assert.equal(detectIntent("necesito un camión para mover 20 toneladas"), "publicar_carga");
  assert.equal(detectIntent("Quiero registrarme como transportista"), "registro_transportista");
  assert.equal(detectIntent("qué documentos piden"), "documentos");
  assert.equal(detectIntent("¿Cuánto cuesta publicar?"), "precio");
  assert.equal(detectIntent("tienen cama baja?"), "tipos_camion");
  assert.equal(detectIntent("quiero hablar con una persona"), "humano");
  assert.equal(detectIntent("tengo un reclamo"), "reclamo");
  assert.equal(detectIntent("cuándo me pagan la factura"), "pago");
  assert.equal(detectIntent("tengo camión disponible para retorno"), "publicar_camion");
  const live = { activeLoads: 2, activeTrucks: 1, recentLoads: ["Santiago → Antofagasta"], recentTrucks: [] };
  assert.match(ruleReply("precio", live), /gratis/i);
  assert.match(ruleReply("publicar_carga", live), /carga360go\.cl\/cargas\/nueva/);
  assert.match(ruleReply("documentos", live), /SOAP/);
  assert.match(ruleReply("buscar_carga", live), /carga360go\.cl\/cargas/);
  assert.match(ruleReply("buscar_carga", live), /requisitos/i);
  for (const intent of ["saludo", "publicar_carga", "registro_transportista", "documentos", "precio", "regiones", "tipos_camion", "contacto"] as const) {
    assert.ok(isSafeReply(ruleReply(intent, live)), intent);
  }
  assert.equal(isSafeReply("Somos de BASSAM"), false);
  assert.equal(isSafeReply("Trabajamos con minería"), false);
});

test("Bot: responde, es idempotente por wamid y respeta el interruptor global", async () => {
  setEnv();
  sent.length = 0;
  const payload = inbound("56922222222", "hola");
  assert.deepEqual(await processWebhookPayload(payload), ["respondido"]);
  assert.deepEqual(await processWebhookPayload(payload), ["duplicado"]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Carga 360 Go/);
  setSetting("bot_enabled", "off");
  assert.deepEqual(await processWebhookPayload(inbound("56922222222", "precio?")), ["sin_respuesta:global_off"]);
  setSetting("bot_enabled", "on");
  delete process.env.WA_ACCESS_TOKEN;
  assert.deepEqual(await processWebhookPayload(inbound("56922222222", "precio?")), ["sin_respuesta:sin_credenciales"]);
});

test("Coexistencia: si el dueño responde desde la app (echo), el bot se pausa en ese chat", async () => {
  setEnv();
  sent.length = 0;
  assert.deepEqual(await processWebhookPayload(inbound("56933333333", "hola")), ["respondido"]);
  assert.deepEqual(await processWebhookPayload(echo("56933333333", "Hola, soy Bastián, le ayudo yo")), ["pausado"]);
  assert.deepEqual(await processWebhookPayload(inbound("56933333333", "gracias, ¿y los documentos?")), ["sin_respuesta:pausado"]);
  assert.equal(sent.length, 1);
  const conv = listConversations().find((c) => c.waId === "56933333333")!;
  assert.ok(conv.pausedUntil && conv.pausedUntil > new Date(Date.now() + 11 * 3600_000).toISOString());
  assert.deepEqual(listMessages(conv.id).map((m) => m.source), ["cliente", "bot", "humano", "cliente"]);
  // Otro chat sigue con bot.
  assert.deepEqual(await processWebhookPayload(inbound("56944444444", "hola")), ["respondido"]);
});

test("Derivación a humano: responde, pausa el chat y no vuelve a hablar", async () => {
  setEnv();
  sent.length = 0;
  assert.deepEqual(await processWebhookPayload(inbound("56955555555", "quiero hablar con una persona")), ["respondido"]);
  const conv = listConversations().find((c) => c.waId === "56955555555")!;
  assert.ok(getConversation(conv.id)?.handoffAt);
  assert.match(sent[0].text, /persona del equipo/);
  assert.deepEqual(await processWebhookPayload(inbound("56955555555", "hola?")), ["sin_respuesta:pausado"]);
});

test("Límite por número y mensajes viejos fuera de la ventana de 24 h", async () => {
  setEnv();
  for (let i = 0; i < 8; i += 1) assert.deepEqual(await processWebhookPayload(inbound("56966666666", `hola ${i}`)), ["respondido"]);
  assert.deepEqual(await processWebhookPayload(inbound("56966666666", "hola otra vez")), ["sin_respuesta:limite"]);
  const old = inbound("56977777777", "hola", { timestamp: String(Math.floor(Date.now() / 1000) - 25 * 3600) });
  assert.deepEqual(await processWebhookPayload(old), ["sin_respuesta:viejo"]);
  setSender(null);
});

test("360dialog: el envío usa waba-v2.360dialog.io/messages y el header D360-API-KEY", () => {
  setEnv();
  const payload = { messaging_product: "whatsapp", to: "56911111111", type: "text", text: { body: "hola" } };
  const meta = buildMessageRequest(payload);
  assert.equal(meta.url, "https://graph.facebook.com/v23.0/111/messages");
  assert.equal(meta.headers.Authorization, "Bearer x");
  assert.equal(meta.headers["Content-Type"], "application/json");
  assert.equal("D360-API-KEY" in meta.headers, false);
  assert.deepEqual(JSON.parse(meta.body), payload);

  process.env.WA_PROVIDER = "360dialog";
  process.env.WA_360_API_KEY = "clave-360-prueba";
  const d360 = buildMessageRequest(payload);
  assert.equal(d360.url, WA_360_MESSAGES_URL);
  assert.equal(d360.url, "https://waba-v2.360dialog.io/messages");
  assert.equal(d360.headers["D360-API-KEY"], "clave-360-prueba");
  assert.equal(d360.headers["Content-Type"], "application/json");
  assert.equal("Authorization" in d360.headers, false);
  assert.deepEqual(JSON.parse(d360.body), payload);
  assert.equal(canSend(), true);
  delete process.env.WA_360_API_KEY;
  assert.equal(canSend(), false);
});

test("360dialog: el webhook autentica con X-Carga360-Secret y ignora sobres no-Cloud con 200", async () => {
  setEnv();
  process.env.WA_PROVIDER = "360dialog";
  const raw = JSON.stringify(inbound("56911111111", "hola"));

  delete process.env.WA_360_WEBHOOK_SECRET;
  const ignored = checkPost(raw, new Headers({ [WA_360_WEBHOOK_HEADER]: "x" }));
  assert.equal(ignored.status, 200);
  assert.equal(ignored.process, false);
  assert.equal(ignored.note, "sin_secreto");

  process.env.WA_360_WEBHOOK_SECRET = "secreto-360";
  assert.equal(checkPost(raw, new Headers()).status, 401);
  assert.equal(checkPost(raw, new Headers({ [WA_360_WEBHOOK_HEADER]: "malo" })).status, 401);
  const ok = checkPost(raw, new Headers({ [WA_360_WEBHOOK_HEADER]: "secreto-360" }));
  assert.equal(ok.status, 200);
  assert.equal(ok.process, true);

  const sig = "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
  assert.equal(checkPost(raw, new Headers({ "x-hub-signature-256": sig })).status, 401);

  const denied = await POST(new Request("http://x/api/whatsapp/webhook", { method: "POST", body: raw, headers: { [WA_360_WEBHOOK_HEADER]: "malo" } }));
  assert.equal(denied.status, 401);

  const history = checkPost(JSON.stringify({ id: "DM0", event: "history", data: { id: "waba", history: [] } }), new Headers({ [WA_360_WEBHOOK_HEADER]: "secreto-360" }));
  assert.equal(history.status, 200);
  assert.equal(history.process, false);
  assert.equal(history.note, "sobre_ignorado");

  const sync = checkPost(JSON.stringify({ id: "DM3", event: "smb_app_state_sync", data: { state_sync: [] } }), new Headers({ [WA_360_WEBHOOK_HEADER]: "secreto-360" }));
  assert.equal(sync.status, 200);
  assert.equal(sync.process, false);

  const partner = await POST(
    new Request("http://x/api/whatsapp/webhook", {
      method: "POST",
      body: JSON.stringify({ event: "history", data: {} }),
      headers: { [WA_360_WEBHOOK_HEADER]: "secreto-360" },
    }),
  );
  assert.equal(partner.status, 200);

  const echoCheck = checkPost(JSON.stringify(echo("56911111111", "hola, le ayudo yo")), new Headers({ [WA_360_WEBHOOK_HEADER]: "secreto-360" }));
  assert.equal(echoCheck.process, true);
  assert.deepEqual(await processWebhookPayload(echoCheck.payload), ["pausado"]);
});
