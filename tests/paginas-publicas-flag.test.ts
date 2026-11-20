import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import sitemap from "../src/app/sitemap";
import { enlacesMenu } from "../src/components/Header";
import {
  PAGINAS_PUBLICAS_NUEVAS,
  paginasPublicasNuevasEnabled,
  paginasPublicasNuevasHidden,
} from "../src/lib/paginas-publicas/flag";
import { middleware } from "../src/middleware";

const FLAG = "UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED";
const RUTAS = ["/clientes", "/documentos", "/finanzas"];
const APAGADO = [undefined, "", "false", "TRUE", "True", "1", "yes", " true", "true "];

function conFlag<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
}

async function conFlagAsync(value: string | undefined, fn: () => Promise<void>) {
  const previous = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
}

function urlsSitemap() {
  return sitemap().map((entry) => entry.url.replace("https://www.carga360go.cl", ""));
}

test("el flag solo enciende con el texto exacto true", () => {
  assert.deepEqual([...PAGINAS_PUBLICAS_NUEVAS], RUTAS);
  for (const value of APAGADO) {
    assert.equal(paginasPublicasNuevasEnabled(value), false, String(value));
    for (const ruta of RUTAS) {
      assert.equal(paginasPublicasNuevasHidden(ruta, value), true, `${ruta} ${String(value)}`);
      assert.equal(paginasPublicasNuevasHidden(`${ruta}/`, value), true);
      assert.equal(paginasPublicasNuevasHidden(`${ruta}?a=1`, value), true);
    }
  }
  assert.equal(paginasPublicasNuevasEnabled("true"), true);
  for (const ruta of RUTAS) assert.equal(paginasPublicasNuevasHidden(ruta, "true"), false);
  for (const ruta of ["/", "/cargas", "/contacto", "/clientes-extra", "/documentos/otro"]) {
    assert.equal(paginasPublicasNuevasHidden(ruta, undefined), false, ruta);
  }
});

test("flag apagado: 404 real en el middleware", async () => {
  for (const value of APAGADO) {
    await conFlagAsync(value, async () => {
      for (const ruta of RUTAS) {
        const response = await middleware(new NextRequest(`http://127.0.0.1:4317${ruta}`));
        assert.equal(response.status, 404, `${ruta} ${String(value)}`);
        assert.equal(response.headers.get("x-robots-tag"), "noindex");
        assert.match(await response.text(), /No encontramos esa página/);
      }
      const home = await middleware(new NextRequest("http://127.0.0.1:4317/"));
      assert.notEqual(home.status, 404);
    });
  }
});

test("flag apagado: fuera del menú y del sitemap", () => {
  conFlag(undefined, () => {
    const hrefs = enlacesMenu().map((link) => link.href);
    const urls = urlsSitemap();
    for (const ruta of RUTAS) {
      assert.equal(hrefs.includes(ruta), false, `menú ${ruta}`);
      assert.equal(urls.includes(ruta), false, `sitemap ${ruta}`);
    }
    assert.ok(hrefs.includes("/cargas"));
    assert.ok(urls.includes("/contacto"));
  });
  assert.equal(enlacesMenu(false).some((link) => RUTAS.includes(link.href)), false);
});

test("flag encendido: responde, sale en el menú y en el sitemap", async () => {
  await conFlagAsync("true", async () => {
    for (const ruta of RUTAS) {
      const response = await middleware(new NextRequest(`http://127.0.0.1:4317${ruta}`));
      assert.notEqual(response.status, 404, ruta);
    }
    const hrefs = enlacesMenu().map((link) => link.href);
    const urls = urlsSitemap();
    for (const ruta of RUTAS) {
      assert.ok(hrefs.includes(ruta), `menú ${ruta}`);
      assert.ok(urls.includes(ruta), `sitemap ${ruta}`);
    }
  });
  assert.ok(RUTAS.every((ruta) => enlacesMenu(true).some((link) => link.href === ruta)));
});

test("las páginas cortan con notFound y next.config fija el flag apagado por defecto", () => {
  const root = process.cwd();
  for (const ruta of RUTAS) {
    const page = fs.readFileSync(path.join(root, "src/app", ruta, "page.tsx"), "utf8");
    assert.match(page, /paginasPublicasNuevasHidden\("\/(clientes|documentos|finanzas)"\)\) notFound\(\)/);
    assert.match(page, /force-dynamic/);
  }
  const config = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
  assert.match(config, /UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED: process\.env\.UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED === "true" \? "true" : "false"/);
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(envExample, /^UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED=false\r?$/m);
});
