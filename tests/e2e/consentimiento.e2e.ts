/**
 * Prueba de navegador del consentimiento de analítica (P1-06): aceptar, rechazar y revocar.
 *
 * - No necesita Next, better-sqlite3 ni base de datos: empaqueta con esbuild los componentes reales
 *   (AnalyticsConsent, ConsentPreferencesLink) y los sirve en una página mínima local. Solo next/link, next/script y
 *   next/navigation se sustituyen por stubs (tests/e2e/harness).
 * - No sale a internet: toda petición a Google se intercepta con route() y se responde con un stub; cualquier otra
 *   petición externa hace fallar la prueba.
 * - Navegador: Chrome/Chromium del sistema (CHROME_PATH, o /usr/bin/google-chrome) con playwright-core; no descarga navegadores.
 * Uso: npm run test:e2e
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const ROOT = path.resolve(__dirname, "../..");
const HARNESS = path.join(__dirname, "harness");
const CONSENT_KEY = "c360-analytics-consent";

let server: http.Server;
let base = "";
let browser: Browser | null = null;
let bundle = "";
let skipReason = "";

const PAGE = `<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><title>harness</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`;

/** Respuesta falsa de gtm.js: hace lo que haría Google (escribir cookies _ga y llamar a doubleclick) sin tocar la red. */
const GTM_STUB = `document.cookie="_ga=GA1.1.1.1; path=/";document.cookie="_ga_1LWRQYDEKS=GS2.1.1; path=/";document.cookie="_gid=GA1.1.2.2; path=/";fetch("https://stats.g.doubleclick.net/g/collect?v=2&tid=G-1LWRQYDEKS&cid=1.1",{mode:"no-cors"}).catch(function(){});`;

const GOOGLE = /(^|\.)((googletagmanager|google-analytics|doubleclick|analytics\.google)\.[a-z.]+|google\.[a-z.]+)$/i;

before(async () => {
  const out = path.join(os.tmpdir(), `c360-e2e-${process.pid}`);
  fs.mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [path.join(HARNESS, "entry.tsx")],
    outfile: path.join(out, "bundle.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    minify: false,
    logLevel: "silent",
    tsconfig: path.join(ROOT, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "next/navigation": path.join(HARNESS, "next-navigation.ts"),
      "next/link": path.join(HARNESS, "next-link.tsx"),
      "next/script": path.join(HARNESS, "next-script.tsx"),
    },
  });
  bundle = fs.readFileSync(path.join(out, "bundle.js"), "utf8");
  server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.writeHead(200, { "content-type": "text/javascript" }).end(bundle);
    } else {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const candidates = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean) as string[];
  const exe = candidates.find((p) => fs.existsSync(p));
  if (!exe) {
    skipReason = "No hay Chrome/Chromium: define CHROME_PATH.";
    return;
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

type Ctx = { context: BrowserContext; page: Page; google: string[]; external: string[] };

async function newCtx(): Promise<Ctx> {
  assert.ok(browser, skipReason || "sin navegador");
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const google: string[] = [];
  const external: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (GOOGLE.test(url.hostname)) {
      google.push(`${url.hostname}${url.pathname}`);
      if (/gtm\.js$|\/gtag\/js$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: "text/javascript", body: GTM_STUB });
      return route.fulfill({ status: 204, body: "" });
    }
    external.push(url.href);
    return route.abort();
  });
  const page = await context.newPage();
  return { context, page, google, external };
}

const gCookies = (page: Page) => page.evaluate(() => document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((n) => n.startsWith("_g")));
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), CONSENT_KEY);

test("sin elección: banner visible, 0 peticiones a Google y 0 cookies _g*", async (t) => {
  if (skipReason) return t.skip(skipReason);
  const { context, page, google, external } = await newCtx();
  try {
    await page.goto(`${base}/`);
    await page.locator(".consent-banner").waitFor();
    await page.waitForTimeout(500);
    assert.equal(google.length, 0);
    assert.deepEqual(await gCookies(page), []);
    assert.equal(await stored(page), null);
    assert.equal(external.length, 0);
  } finally {
    await context.close();
  }
});

test("rechazar: guarda denied, oculta el banner y no hay peticiones a Google ni al recargar", async (t) => {
  if (skipReason) return t.skip(skipReason);
  const { context, page, google } = await newCtx();
  try {
    await page.goto(`${base}/`);
    await page.getByRole("button", { name: "Rechazar" }).click();
    assert.equal(await stored(page), "denied");
    assert.equal(await page.locator(".consent-banner").count(), 0);
    await page.reload();
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".consent-banner").count(), 0);
    assert.equal(google.length, 0);
    assert.deepEqual(await gCookies(page), []);
  } finally {
    await context.close();
  }
});

test("aceptar carga gtm.js y gtag; revocar desde «Preferencias de privacidad» deja 0 cookies _g* y 0 peticiones después", async (t) => {
  if (skipReason) return t.skip(skipReason);
  const { context, page, google, external } = await newCtx();
  try {
    await page.goto(`${base}/`);
    assert.equal(google.length, 0, "antes de aceptar no hay peticiones a Google");
    await page.getByRole("button", { name: "Aceptar" }).click();
    await page.waitForFunction(() => document.cookie.includes("_ga="));
    await page.waitForTimeout(400);
    assert.equal(await stored(page), "granted");
    assert.ok(google.some((g) => g.endsWith("/gtm.js")), `gtm.js: ${google}`);
    assert.ok(google.some((g) => g.endsWith("/gtag/js")), `gtag/js: ${google}`);
    assert.ok(google.some((g) => g.startsWith("stats.g.doubleclick.net")), `doubleclick: ${google}`);
    assert.ok((await gCookies(page)).includes("_ga"));

    // Revocar: el enlace del pie reabre el banner y muestra la elección actual.
    await page.getByRole("button", { name: "Preferencias de privacidad" }).click();
    await page.locator(".consent-banner").waitFor();
    assert.match(await page.locator(".consent-banner").innerText(), /aceptada/);
    const reload = page.waitForNavigation();
    await page.getByRole("button", { name: "Rechazar" }).click();
    await reload;
    await page.waitForTimeout(500);
    assert.equal(await stored(page), "denied");
    assert.deepEqual(await gCookies(page), [], "sin cookies _g* tras revocar");

    // Después de revocar: ninguna petición nueva a Google, ni al recargar ni al abrir otra página.
    google.length = 0;
    await page.reload();
    await page.goto(`${base}/cargas`);
    await page.waitForTimeout(600);
    assert.equal(google.length, 0, "0 peticiones a Google tras revocar");
    assert.deepEqual(await gCookies(page), []);
    assert.equal(await page.locator(".consent-banner").count(), 0);
    assert.equal(external.length, 0);
  } finally {
    await context.close();
  }
});

test("cambiar de rechazado a aceptado desde el pie carga los scripts", async (t) => {
  if (skipReason) return t.skip(skipReason);
  const { context, page, google } = await newCtx();
  try {
    await page.goto(`${base}/`);
    await page.getByRole("button", { name: "Rechazar" }).click();
    await page.getByRole("button", { name: "Preferencias de privacidad" }).click();
    await page.getByRole("button", { name: "Aceptar" }).click();
    await page.waitForFunction(() => document.cookie.includes("_ga="));
    assert.equal(await stored(page), "granted");
    assert.ok(google.some((g) => g.endsWith("/gtm.js")));
  } finally {
    await context.close();
  }
});

test("en /admin no hay banner ni peticiones a Google, aunque el consentimiento esté dado", async (t) => {
  if (skipReason) return t.skip(skipReason);
  const { context, page, google } = await newCtx();
  try {
    await context.addInitScript((k) => localStorage.setItem(k, "granted"), CONSENT_KEY);
    await page.goto(`${base}/admin`);
    await page.waitForTimeout(600);
    assert.equal(await page.locator(".consent-banner").count(), 0);
    assert.equal(google.length, 0);
    assert.deepEqual(await gCookies(page), []);
  } finally {
    await context.close();
  }
});
