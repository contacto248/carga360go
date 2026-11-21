import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { AlertCenter } from "../src/components/sistema/AlertCenter";
import { DataTable } from "../src/components/sistema/DataTable";
import { KpiCards } from "../src/components/sistema/KpiCards";
import { Timeline } from "../src/components/sistema/Timeline";
import { sistemaEnabled, sistemaPageHidden } from "../src/lib/sistema/flag";
import { middleware } from "../src/middleware";

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const PRICE = /\$\s?\d|CLP\s*\d|comisi[oó]n|precio de lista|TrackChain|trackchain/i;

test("tokens copian la paleta vigente y no adoptan el acento del panel interno", () => {
  const tokens = read("src/app/tokens.css");
  for (const token of [
    "--navy: #0B1633",
    "--navy2: #152647",
    "--brand-navy: #002451",
    "--brand-orange: #FF5001",
    "--accent: #C84300",
    "--accent2: #A33600",
    "--bg: #f5f7fa",
    "--card: #fff",
    "--ink: #0f1b2d",
    "--muted: #5b6778",
    "--muted-soft: #66717f",
    "--line: #d9e0ea",
    "--line-strong: #c3cddc",
    "--ok: #16a34a",
    "--warn: #eab308",
    "--bad: #dc2626",
    "--focus: #0E7490",
    "--focus-dark: #67E8F9",
    "--r: 16px",
  ]) {
    assert.ok(tokens.includes(token), token);
  }
  assert.equal(tokens.includes("#79b7e9"), false);
  const layout = read("src/app/layout.tsx");
  assert.ok(layout.indexOf('import "./tokens.css"') < layout.indexOf('import "./globals.css"'));
  assert.match(layout, /Sora/);
  assert.match(layout, /Figtree/);
});

test("el cascarón tiene nav lateral, barra compacta y el logo a la misma escala", () => {
  const header = read("src/components/Header.tsx");
  const css = read("src/app/globals.css");
  assert.match(header, /aria-label="Principal"/);
  assert.match(header, /aria-label="Accesos rápidos"/);
  assert.match(header, /aria-current=\{on \? "page" : undefined\}/);
  assert.match(header, /className="side-nav"/);
  assert.match(header, /className="tabbar"/);
  assert.match(header, /mobile-cta/);
  assert.match(header, /alt="Carga360go"/);
  assert.match(header, /width=\{159\}/);
  assert.match(header, /height=\{36\}/);
  assert.match(header, /logo-wordmark\.png/);
  assert.match(header, /Inicio/);
  assert.match(header, /Cargas/);
  assert.match(header, /Camiones/);
  assert.match(header, /Publicar carga/);
  assert.match(header, /Mi cuenta/);
  assert.match(header, /Agente de acreditación/);
  assert.doesNotMatch(header, /Agente BASSAM 360/);
  assert.match(header, /agenteBassam \?/);
  assert.match(header, /user\?\.role === "admin"[\s\S]*href="\/admin\/bassam"[\s\S]*Panel de control/);
  assert.doesNotMatch(header, /Panel BASSAM|BASSAM 360/);
  assert.doesNotMatch(header, /Publicar camión|Buscar camión|Regiones/);
  assert.equal(header.includes("/admin/ops"), false);
  assert.equal(header.includes("/sistema"), false);
  assert.equal(header.includes("/torre"), false);
  assert.doesNotMatch(header, PRICE);
  assert.match(css, /\.app-shell\{display:grid/);
  assert.match(css, /@media\(min-width:820px\)/);
  assert.match(css, /@media\(max-width:819px\)\{\s*\.tabbar\{display:flex/);
  assert.equal(css.includes("#79b7e9"), false);
});

test("indicadores, tabla, línea de tiempo y alertas renderizan vacíos y con marca accesible", () => {
  const emptyKpi = renderToStaticMarkup(createElement(KpiCards, { items: [] }));
  assert.match(emptyKpi, /aria-label="Indicadores"/);
  assert.match(emptyKpi, /Sin datos/);
  assert.doesNotMatch(emptyKpi, PRICE);

  const kpi = renderToStaticMarkup(
    createElement(KpiCards, { items: [{ id: "estado", label: "Estado", value: "Sin datos" }] }),
  );
  assert.match(kpi, /<strong>Sin datos<\/strong>/);
  assert.match(kpi, /Estado/);
  assert.doesNotMatch(kpi, PRICE);

  const table = renderToStaticMarkup(createElement(DataTable, { columns: [], rows: [] }));
  assert.match(table, /<caption>Tabla<\/caption>/);
  assert.match(table, /scope="col"/);
  assert.match(table, /Sin datos/);
  assert.doesNotMatch(table, PRICE);

  const timeline = renderToStaticMarkup(createElement(Timeline, { events: [] }));
  assert.match(timeline, /aria-label="Línea de tiempo"/);
  assert.match(timeline, /Sin datos/);

  const marked = renderToStaticMarkup(
    createElement(Timeline, { events: [{ id: "1", label: "Sin datos", when: "—" }] }),
  );
  assert.match(marked, /<ol>/);
  assert.match(marked, /<time>/);
  assert.match(marked, /Sin datos/);

  const alerts = renderToStaticMarkup(createElement(AlertCenter, { alerts: [] }));
  assert.match(alerts, /aria-label="Centro de alertas"/);
  assert.match(alerts, /Sin datos/);

  const one = renderToStaticMarkup(
    createElement(AlertCenter, {
      alerts: [{ id: "a", title: "Aviso", detail: "Sin datos", tone: "warn" }],
    }),
  );
  assert.match(one, /tone-warn/);
  assert.match(one, /<ul>/);
  assert.match(one, /Aviso/);
  assert.doesNotMatch(one, PRICE);
});

test("la vista de sistema responde 404 salvo el texto exacto true y no se enlaza", () => {
  assert.equal(sistemaEnabled({}), false);
  assert.equal(sistemaEnabled({ UI_SISTEMA_ENABLED: "false" }), false);
  assert.equal(sistemaEnabled({ UI_SISTEMA_ENABLED: "TRUE" }), false);
  assert.equal(sistemaEnabled({ UI_SISTEMA_ENABLED: "1" }), false);
  assert.equal(sistemaEnabled({ UI_SISTEMA_ENABLED: "yes" }), false);
  assert.equal(sistemaEnabled({ UI_SISTEMA_ENABLED: " true" }), false);
  assert.equal(sistemaEnabled({ UI_SISTEMA_ENABLED: "true" }), true);
  assert.equal(sistemaPageHidden("/sistema", {}), true);
  assert.equal(sistemaPageHidden("/sistema/", { UI_SISTEMA_ENABLED: "TRUE" }), true);
  assert.equal(sistemaPageHidden("/sistema", { UI_SISTEMA_ENABLED: "true" }), false);
  assert.equal(sistemaPageHidden("/cargas", {}), false);
  assert.equal(sistemaPageHidden("/", { UI_SISTEMA_ENABLED: "true" }), false);

  const example = read(".env.example");
  assert.match(example, /^UI_SISTEMA_ENABLED=false$/m);
  const page = read("src/app/sistema/page.tsx");
  assert.match(page, /notFound\(/);
  assert.match(page, /sistemaPageHidden/);
  assert.doesNotMatch(page, PRICE);
  for (const file of ["src/components/Header.tsx", "src/components/Footer.tsx", "src/app/sitemap.ts", "src/app/page.tsx"]) {
    assert.equal(read(file).includes("/sistema"), false, file);
  }
});

test("el middleware corta /sistema con 404 real cuando el flag no es true", async () => {
  const previous = process.env.UI_SISTEMA_ENABLED;
  try {
    for (const value of [undefined, "false", "TRUE", "1", "yes", " true"]) {
      if (value === undefined) delete process.env.UI_SISTEMA_ENABLED;
      else process.env.UI_SISTEMA_ENABLED = value;
      const response = await middleware(new NextRequest("http://127.0.0.1:4317/sistema"));
      assert.equal(response.status, 404, String(value));
      const html = await response.text();
      assert.match(html, /No encontramos esa página/);
      assert.doesNotMatch(html, /Sistema de diseño|Cargando/);
    }
    process.env.UI_SISTEMA_ENABLED = "true";
    const open = await middleware(new NextRequest("http://127.0.0.1:4317/sistema"));
    assert.notEqual(open.status, 404);
    const home = await middleware(new NextRequest("http://127.0.0.1:4317/"));
    assert.notEqual(home.status, 404);
  } finally {
    if (previous === undefined) delete process.env.UI_SISTEMA_ENABLED;
    else process.env.UI_SISTEMA_ENABLED = previous;
  }
});
