import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { AdministracionVista, AnalyticsVista, CopilotoVista } from "../src/components/vistas/OperacionVista";
import { filasAvisos, indicadoresAdmin, indicadoresReales } from "../src/lib/vistas/datos";
import { uiExactTrue, uiVistaEnabled, uiVistaHidden } from "../src/lib/vistas/flag";
import { middleware } from "../src/middleware";

const root = process.cwd();
const PRICE = /\$\s?\d|CLP\s*\d|comisi[oó]n|precio de lista|TrackChain|trackchain/i;

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const VACIO = {
  activeLoads: 0,
  activeTrucks: 0,
  verifiedCarriers: 0,
  companies: 0,
  regionsActive: 0,
  matches: 0,
};

test("los conteos reales se muestran y el cero total queda vacío, sin precios", () => {
  assert.deepEqual(indicadoresReales(null), []);
  assert.deepEqual(indicadoresReales(VACIO), []);
  const kpis = indicadoresReales({ ...VACIO, activeLoads: 2, verifiedCarriers: 1 });
  assert.equal(kpis.find((item) => item.id === "cargas")?.value, "2");
  assert.equal(kpis.find((item) => item.id === "verificados")?.value, "1");
  assert.equal(kpis.some((item) => item.value.includes("$")), false);

  assert.deepEqual(indicadoresAdmin(null), []);
  assert.deepEqual(indicadoresAdmin({ users: 0, loads: 0, trucks: 0, expiring: 0, expired: 0 }), []);
  const admin = indicadoresAdmin({ users: 3, loads: 0, trucks: 1, expiring: 0, expired: 2 });
  assert.equal(admin.find((item) => item.label === "Usuarios")?.value, "3");
  assert.equal(admin.find((item) => item.label === "Documentos vencidos")?.value, "2");
  assert.equal(admin.some((item) => /\$|CLP/.test(item.value)), false);

  const rows = filasAvisos([
    { id: "1", kind: "carga", origin: "Calama", destination: "Antofagasta", equipment: "rampla_plana", date: "2026-11-17" },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]?.cells, ["Carga", "Calama", "Antofagasta", "Rampla plana", "17-11-2026"]);
  assert.equal(rows[0]?.cells.some((cell) => PRICE.test(cell)), false);
  assert.deepEqual(filasAvisos([]), []);
});

test("analytics, copiloto y administración renderizan vacío o datos reales y son accesibles", () => {
  const analytics = renderToStaticMarkup(createElement(AnalyticsVista, { kpis: [], rows: [] }));
  assert.match(analytics, /<h1>Analytics<\/h1>/);
  assert.match(analytics, /Próximamente/);
  assert.match(analytics, /aria-label="Indicadores"/);
  assert.match(analytics, /Avisos vigentes/);
  assert.match(analytics, /scope="col"/);
  assert.match(analytics, /Sin datos/);
  assert.match(analytics, /href="\/cargas"/);
  assert.match(analytics, /href="\/camiones"/);
  assert.match(analytics, /href="\/terminos"/);
  assert.match(analytics, /href="\/privacidad"/);
  assert.match(analytics, /aria-label="Línea de tiempo"/);
  assert.match(analytics, /aria-label="Centro de alertas"/);
  assert.doesNotMatch(analytics, /href="\/clientes"|href="\/control-tower"|href="\/tracking"/);
  assert.doesNotMatch(analytics, PRICE);

  const filled = renderToStaticMarkup(
    createElement(AnalyticsVista, {
      kpis: [{ id: "cargas", label: "Cargas vigentes", value: "2" }],
      rows: [{ id: "carga-1", cells: ["Carga", "Calama", "Antofagasta", "Rampla plana", "17-11-2026"] }],
    }),
  );
  assert.match(filled, /<strong>2<\/strong>/);
  assert.match(filled, /Calama/);
  assert.doesNotMatch(filled, PRICE);

  const copiloto = renderToStaticMarkup(createElement(CopilotoVista));
  assert.match(copiloto, /<h1>Copiloto<\/h1>/);
  assert.match(copiloto, /Próximamente/);
  assert.match(copiloto, /href="\/agente-360go"/);
  assert.match(copiloto, /<button[^>]*disabled[^>]*>Avísame cuando esté disponible<\/button>/);
  assert.match(copiloto, /Sin datos/);
  assert.doesNotMatch(copiloto, /Agente Carga360go|voz|WhatsApp/);
  assert.doesNotMatch(copiloto, PRICE);

  const admin = renderToStaticMarkup(createElement(AdministracionVista, { kpis: [] }));
  assert.match(admin, /<h1>Administración<\/h1>/);
  assert.match(admin, /href="\/admin"/);
  assert.match(admin, /Sin datos/);
  assert.match(admin, /panel de administración/);
  assert.doesNotMatch(admin, PRICE);
});

test("las rutas nuevas responden 404 salvo el texto exacto true en maestro e hijo", () => {
  assert.equal(uiExactTrue("UI_OPS_ENABLED", {}), false);
  assert.equal(uiVistaEnabled("UI_ANALYTICS_ENABLED", { UI_OPS_ENABLED: "true", UI_ANALYTICS_ENABLED: "TRUE" }), false);
  assert.equal(uiVistaEnabled("UI_ANALYTICS_ENABLED", { UI_OPS_ENABLED: "true", UI_ANALYTICS_ENABLED: "1" }), false);
  assert.equal(uiVistaEnabled("UI_ANALYTICS_ENABLED", { UI_OPS_ENABLED: "true", UI_ANALYTICS_ENABLED: "yes" }), false);
  assert.equal(uiVistaEnabled("UI_ANALYTICS_ENABLED", { UI_OPS_ENABLED: "true", UI_ANALYTICS_ENABLED: " true" }), false);
  assert.equal(uiVistaEnabled("UI_ANALYTICS_ENABLED", { UI_OPS_ENABLED: "TRUE", UI_ANALYTICS_ENABLED: "true" }), false);
  assert.equal(uiVistaEnabled("UI_COPILOTO_ENABLED", { UI_COPILOTO_ENABLED: "true" }), false);
  assert.equal(uiVistaEnabled("UI_ADMIN_ENABLED", { UI_OPS_ENABLED: "true", UI_ADMIN_ENABLED: "true" }), true);

  const on = { UI_OPS_ENABLED: "true", UI_ANALYTICS_ENABLED: "true", UI_COPILOTO_ENABLED: "true", UI_ADMIN_ENABLED: "true" };
  assert.equal(uiVistaHidden("/torre/analytics", {}), true);
  assert.equal(uiVistaHidden("/torre/analytics/", { UI_OPS_ENABLED: "true", UI_ANALYTICS_ENABLED: "TRUE" }), true);
  assert.equal(uiVistaHidden("/torre/copiloto", {}), true);
  assert.equal(uiVistaHidden("/torre/administracion", {}), true);
  assert.equal(uiVistaHidden("/torre/analytics", on), false);
  assert.equal(uiVistaHidden("/torre/copiloto", on), false);
  assert.equal(uiVistaHidden("/torre/administracion", on), false);
  for (const path of ["/", "/ingreso", "/login", "/agente-360go", "/admin", "/admin/agente", "/terminos", "/privacidad"]) {
    assert.equal(uiVistaHidden(path, on), false, path);
  }

  const example = read(".env.example");
  assert.match(example, /^UI_OPS_ENABLED=false$/m);
  assert.match(example, /^UI_ANALYTICS_ENABLED=false$/m);
  assert.match(example, /^UI_COPILOTO_ENABLED=false$/m);
  assert.match(example, /^UI_ADMIN_ENABLED=false$/m);

  for (const [file, marker] of [
    ["src/app/torre/analytics/page.tsx", 'uiVistaHidden("/torre/analytics")'],
    ["src/app/torre/copiloto/page.tsx", 'uiVistaHidden("/torre/copiloto")'],
    ["src/app/torre/administracion/page.tsx", 'uiVistaHidden("/torre/administracion")'],
  ] as const) {
    const source = read(file);
    assert.match(source, /notFound\(/);
    assert.ok(source.includes(marker), file);
    assert.doesNotMatch(source, PRICE);
  }

  for (const file of [
    "src/components/Header.tsx",
    "src/components/Footer.tsx",
    "src/app/sitemap.ts",
    "src/app/page.tsx",
    "src/components/PrivacyGate.tsx",
    "src/app/ingreso/page.tsx",
    "src/app/recuperar/page.tsx",
    "src/app/restablecer/page.tsx",
    "src/app/verificar-correo/page.tsx",
    "src/app/terminos/page.tsx",
    "src/app/privacidad/page.tsx",
    "src/app/politica-de-pagos/page.tsx",
  ]) {
    assert.equal(read(file).includes("/torre/"), false, file);
  }
});

test("el middleware corta las tres rutas con 404 real cuando el flag no es true", async () => {
  const names = ["UI_OPS_ENABLED", "UI_ANALYTICS_ENABLED", "UI_COPILOTO_ENABLED", "UI_ADMIN_ENABLED"] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    for (const path of ["/torre/analytics", "/torre/copiloto", "/torre/administracion"]) {
      const response = await middleware(new NextRequest(`http://127.0.0.1:4317${path}`));
      assert.equal(response.status, 404, path);
      const html = await response.text();
      assert.match(html, /No encontramos esa página/);
      assert.doesNotMatch(html, /Analytics|Copiloto|Administración|Cargando/);
    }
    process.env.UI_OPS_ENABLED = "true";
    process.env.UI_ANALYTICS_ENABLED = "TRUE";
    const still = await middleware(new NextRequest("http://127.0.0.1:4317/torre/analytics"));
    assert.equal(still.status, 404);

    for (const name of ["UI_ANALYTICS_ENABLED", "UI_COPILOTO_ENABLED", "UI_ADMIN_ENABLED"]) process.env[name] = "true";
    for (const path of ["/torre/analytics", "/torre/copiloto", "/torre/administracion"]) {
      const open = await middleware(new NextRequest(`http://127.0.0.1:4317${path}`));
      assert.notEqual(open.status, 404, path);
    }
    const home = await middleware(new NextRequest("http://127.0.0.1:4317/"));
    assert.notEqual(home.status, 404);
    const login = await middleware(new NextRequest("http://127.0.0.1:4317/ingreso"));
    assert.notEqual(login.status, 404);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
