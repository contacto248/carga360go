import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { POST } from "../src/app/api/agente-360go/route";
import { manifestFor } from "../src/app/manifest";
import { XAI_MODEL, xaiRuntime } from "../src/lib/agente360/config";
import { AVISO_COSTO, AVISO_SIN_CLAVE, presentarRespuesta } from "../src/lib/agente360/respuesta";
import { resetRateLimits } from "../src/lib/rate-limit";

const ROOT = path.join(__dirname, "..");
const SECRET = "xai-sentinel-9f3c1a7e-no-filtrar";
const META = "meta-sentinel-token-no-filtrar";
const ENV_KEYS = ["XAI_API_KEY", "AI_API_KEY", "AI_BASE_URL", "AI_TIMEOUT_MS", "WA_ACCESS_TOKEN", "WA_PHONE_NUMBER_ID", "WA_PROVIDER", "WA_360_API_KEY", "GEMINI_API_KEY"];

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function pngSize(rel: string) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function clearAi() {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.WA_PROVIDER = "meta";
}

const ctx = { params: Promise.resolve({}) };

async function post(message: string, history?: { role: string; text: string }[]) {
  resetRateLimits();
  const response = await POST(
    new Request("http://127.0.0.1:4317/api/agente-360go", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.60" },
      body: JSON.stringify(history ? { message, history } : { message }),
    }),
    ctx,
  );
  const data = (await response.json()) as { reply?: string; error?: string };
  return { response, data, raw: JSON.stringify(data) };
}

test("manifiesto, iconos y service worker del Agente 360go", () => {
  const manifest = JSON.parse(read("public/agente-360go/manifest.webmanifest")) as {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    lang: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  assert.equal(manifest.name, "Agente 360go");
  assert.equal(manifest.short_name, "Agente 360go");
  assert.equal(manifest.start_url, "/agente-360go");
  assert.equal(manifest.scope, "/agente-360go");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "es-CL");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  assert.deepEqual(pngSize("public/agente-360go/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngSize("public/agente-360go/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(pngSize("public/agente-360go/apple-touch-icon.png"), { width: 180, height: 180 });

  const sw = read("public/agente-360go/sw.js");
  assert.match(sw, /addEventListener\(\s*"fetch"/);
  assert.match(sw, /\/api\//);
  assert.equal(/XAI_API_KEY|AI_API_KEY|WA_ACCESS_TOKEN/.test(sw), false);

  const app = read("src/app/agente-360go/Agente360goApp.tsx");
  const css = read("src/app/agente-360go/agente-360go.module.css");
  assert.match(app, /Agente 360go/);
  assert.match(app, /Carga360go/);
  assert.match(app, /c360\.agente360\.historial/);
  assert.match(app, /Borrar historial/);
  assert.match(app, /localStorage\.removeItem/);
  assert.match(app, /\/agente-360go\/sw\.js/);
  assert.match(app, /scope: "\/agente-360go"/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.equal(/XAI_API_KEY|process\.env/.test(app), false);

  const layout = read("src/app/agente-360go/layout.tsx");
  assert.match(layout, /manifest: "\/agente-360go\/manifest.webmanifest"/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /title: "Agente 360go"/);

  const readme = read("docs/agente-360go/README.md");
  assert.match(readme, /iPhone 14 Pro/);
  assert.match(readme, /Agregar a inicio/);
  assert.match(readme, /Windows 11/);
  assert.match(readme, /Edge/);
  assert.match(readme, /XAI_API_KEY/);
  assert.equal(/sk-|xai-[a-z0-9]{10,}/i.test(readme), false);

  const site = read("src/app/manifest.ts");
  assert.match(site, /short_name: "Carga360go"/);
  assert.match(site, /start_url: "\/"/);
  assert.equal(manifestFor("/").short_name, "Carga360go");
  assert.equal(manifestFor("/").start_url, "/");
  assert.equal(manifestFor("/agente-360go").name, "Agente 360go");
  assert.equal(manifestFor("/agente-360go").start_url, "/agente-360go");
  assert.equal(manifestFor("/agente-360go").display, "standalone");
  const publico = read("src/app/api/agente/route.ts");
  assert.match(publico, /Sin `status` técnico/);
  assert.match(read("src/components/VoiceAgent.tsx"), /\/api\/agente/);
});

describe("API del Agente 360go", { concurrency: 1 }, () => {
test("sin clave: responde en la UI y no llama a xAI", async () => {
  clearAi();
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("no", { status: 500 });
  }) as typeof fetch;
  try {
    assert.equal(xaiRuntime().key, "");
    const { response, data, raw } = await post("¿Qué cargas hay de Arica a Punta Arenas?");
    assert.equal(response.status, 200);
    assert.equal(data.reply, AVISO_SIN_CLAVE);
    assert.match(data.reply || "", /Falta configurar la clave/);
    assert.equal(called, false);
    assert.equal(/XAI_API_KEY|AI_API_KEY|grok|api\.x\.ai/i.test(raw), false);
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv();
  }
});

test("con clave: llama a api.x.ai y la respuesta no filtra la clave", async () => {
  clearAi();
  process.env.XAI_API_KEY = SECRET;
  const realFetch = globalThis.fetch;
  let auth = "";
  let url = "";
  let body = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    url = String(input);
    auth = new Headers(init?.headers).get("authorization") || "";
    body = String(init?.body || "");
    return new Response(JSON.stringify({ choices: [{ message: { content: `eco ${SECRET} y el costo real del flete. El GPS en vivo está disponible.` } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const { response, data, raw } = await post("Necesito el costo del flete.");
    assert.equal(response.status, 200);
    assert.equal(url, "https://api.x.ai/v1/chat/completions");
    assert.equal(auth, `Bearer ${SECRET}`);
    assert.equal(body.includes(SECRET), false);
    assert.match(body, new RegExp(XAI_MODEL));
    assert.equal(raw.includes(SECRET), false);
    assert.match(data.reply || "", /costo de referencia desglosado/);
    assert.equal((data.reply || "").toLowerCase().includes("costo real"), false);
    assert.match(data.reply || "", new RegExp(AVISO_COSTO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(data.reply || "", /no está operativa/);
    assert.equal(/XAI_API_KEY|Bearer /.test(raw), false);
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv();
  }
});

test("si el proyecto ya apunta AI_BASE_URL a xAI, usa AI_API_KEY y no XAI_API_KEY", async () => {
  clearAi();
  process.env.AI_BASE_URL = "https://api.x.ai/v1/";
  process.env.AI_API_KEY = SECRET;
  const realFetch = globalThis.fetch;
  let auth = "";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    auth = new Headers(init?.headers).get("authorization") || "";
    return new Response(JSON.stringify({ error: SECRET }), { status: 401, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.equal(xaiRuntime().key, SECRET);
    const { response, raw } = await post("Hola");
    assert.equal(response.status, 200);
    assert.equal(auth, `Bearer ${SECRET}`);
    assert.equal(raw.includes(SECRET), false);
    assert.match(raw, /No pude completar la consulta/);
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv();
  }
});

test("sin token de WhatsApp el chat responde; con token no se filtra", async () => {
  clearAi();
  process.env.XAI_API_KEY = SECRET;
  const realFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    body = String(init?.body || "");
    return new Response(JSON.stringify({ choices: [{ message: { content: `Siga en el chat. ${META}` } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const off = await post("¿Puedo seguir por WhatsApp?");
    assert.equal(off.response.status, 200);
    assert.equal(off.raw.includes("wa.me"), false);
    assert.match(body, /no está listo/i);

    process.env.WA_ACCESS_TOKEN = META;
    process.env.WA_PHONE_NUMBER_ID = "109876543210";
    const on = await post("¿Puedo seguir por WhatsApp?");
    assert.equal(on.response.status, 200);
    assert.equal(on.raw.includes(META), false);
    assert.equal(on.raw.includes(SECRET), false);
    assert.equal(body.includes(META), false);
    assert.match(body, /https:\/\/wa\.me\/56958428693/);
    assert.match(on.raw, /Siga en el chat/);
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv();
  }
});

test("presentarRespuesta no deja costo real ni la clave", () => {
  const text = presentarRespuesta(`El costo real es interno. Clave ${SECRET}.`, [SECRET]);
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.toLowerCase().includes("costo real"), false);
  assert.match(text, /costo de referencia desglosado/);
  assert.match(text, /Valor estimativo de referencia/);
});
});
