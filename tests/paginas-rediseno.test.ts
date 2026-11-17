import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { chromium, type Browser } from "@playwright/test";

const root = process.cwd();
const PRICE = /\$\s?\d|CLP\s*\d|comisi[oó]n|precio de lista/i;
const BANNED = ["/seguimiento", "/rastreo", "/cotizador", "/cargas-de-retorno"];

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function hrefs(source: string): string[] {
  return [...source.matchAll(/href="([^"]+)"/g)].map((match) => match[1].split(/[?#]/)[0]);
}

test("inicio, marketplace y torre usan el copy seguro y no enlazan destinos prohibidos", () => {
  const home = read("src/app/page.tsx");
  const market = read("src/app/marketplace/page.tsx");
  const tower = read("src/app/control-tower/page.tsx");
  const piezas = read("src/components/rediseno/Piezas.tsx");
  const layout = read("src/app/layout.tsx");
  const ingreso = read("src/app/ingreso/page.tsx");
  const privacy = read("src/components/PrivacyGate.tsx");

  assert.match(piezas, />Próximamente</);
  assert.match(piezas, /<button type="button" className="btn sec" disabled>/);
  assert.match(piezas, /href="\/terminos"/);
  assert.match(piezas, /href="\/privacidad"/);
  assert.match(home, /Cargas, camiones y retornos en Chile, de Arica a Punta Arenas\./);
  assert.match(home, /<h1 id="inicio-titulo">/);
  assert.match(home, /Conocer Carga360go para empresas/);
  assert.match(home, /Conocer la torre de control/);
  assert.match(home, /href="\/agente-360go"/);
  assert.match(home, /Escribirle a AI\.CARGA360/);
  assert.doesNotMatch(home, /También puedes hablarle|Seguimiento en vivo/i);
  assert.match(market, /<h1 id="market-titulo">Cargas y camiones que calzan, en un solo marketplace\.<\/h1>/);
  assert.match(market, /Aún no hay avisos que calcen con tu búsqueda\. Guarda una alerta y te avisamos por correo\./);
  assert.doesNotMatch(market, /WhatsApp/);
  assert.match(tower, /<h1 id="torre-titulo">Torre de control: tu operación de flete en un solo panel\.<\/h1>/);
  assert.match(tower, /Avísame cuando esté disponible/);
  assert.match(tower, /Los hitos de cada operación quedan registrados con fecha y hora/);
  assert.match(tower, /aria-label="Indicadores"|KpiCards/);
  assert.match(tower, /Sin datos de viaje/);
  assert.match(layout, /PrivacyGate/);
  assert.match(privacy, /export function PrivacyGate/);
  assert.match(ingreso, /LoginForm/);
  assert.match(ingreso, /<h1>Ingresar<\/h1>/);

  for (const source of [home, market, tower, piezas]) {
    assert.doesNotMatch(source, PRICE);
    for (const href of hrefs(source)) {
      assert.equal(BANNED.includes(href), false, href);
    }
  }
});

function waitForHttp(url: string, child: ChildProcess): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`next dev terminó con ${child.exitCode}`));
        return;
      }
      fetch(url)
        .then((response) => {
          if (response.status < 500) {
            clearInterval(timer);
            resolve();
          }
        })
        .catch(() => {
          if (Date.now() - started > 90_000) {
            clearInterval(timer);
            reject(new Error("next dev no respondió"));
          }
        });
    }, 400);
  });
}

test("render móvil a 360 px de /, /login y /agente-360go sin desborde horizontal", { timeout: 180_000 }, async () => {
  const port = 4391;
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", "dev", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let browser: Browser | undefined;
  let log = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    log += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    log += chunk.toString();
  });
  try {
    await waitForHttp(`${origin}/`, child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
    page.setDefaultNavigationTimeout(90_000);
    for (const path of ["/", "/marketplace", "/control-tower", "/login", "/agente-360go"]) {
      const response = await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      assert.ok(response, path);
      assert.ok(response.status() < 400, `${path} respondió ${response.status()}`);
      if (path === "/login") assert.match(page.url(), /\/ingreso$/);
      const box = await page.evaluate(() => {
        const client = document.documentElement.clientWidth;
        const scroll = document.documentElement.scrollWidth;
        const wide = [...document.body.querySelectorAll("*")]
          .filter((node) => node.getBoundingClientRect().right > client + 1)
          .slice(0, 6)
          .map((node) => `${node.tagName}.${String((node as HTMLElement).className).slice(0, 60)}`);
        const headings = document.querySelectorAll("h1").length;
        const sinNombre = [...document.querySelectorAll("a, button")].filter((node) => {
          const text = (node.textContent || "").replace(/\s+/g, " ").trim();
          return !text && !node.getAttribute("aria-label") && !node.getAttribute("aria-labelledby");
        }).length;
        return { client, scroll, wide, headings, sinNombre };
      });
      assert.equal(box.client, 360, path);
      assert.ok(box.scroll <= box.client + 1, `${path} desborda: ${box.scroll}px ${box.wide.join(" | ")}`);
      assert.equal(box.sinNombre, 0, `${path} tiene un enlace o botón sin nombre`);
      if (path !== "/agente-360go") assert.equal(box.headings, 1, path);
    }
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("h1").innerText(), /Cargas, camiones y retornos en Chile/);
    assert.equal(await page.getByText("Próximamente", { exact: true }).count(), 1);
    await page.goto(`${origin}/control-tower`, { waitUntil: "domcontentloaded" });
    assert.ok((await page.getByRole("button", { name: "Avísame cuando esté disponible" }).count()) >= 1);
    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("h1").innerText(), /Ingresar/);
    await page.goto(`${origin}/agente-360go`, { waitUntil: "domcontentloaded" });
    assert.match(await page.locator("body").innerText(), /AI\.CARGA360/);
  } catch (error) {
    const detail = log.slice(-2000);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${detail}`);
  } finally {
    await browser?.close().catch(() => undefined);
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
    await once(child, "exit").catch(() => undefined);
  }
});
