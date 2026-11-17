import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { OperacionesVista } from "../src/components/paginas/OperacionesVista";
import { TrackingVista } from "../src/components/paginas/TrackingVista";
import { TransportistasVista } from "../src/components/paginas/TransportistasVista";
import { paginasOpsEnabled, paginasOpsHidden } from "../src/lib/paginas-ops/flag";
import { middleware } from "../src/middleware";

const root = process.cwd();
const PRICE = /\$\s?\d|CLP\s*\d|comisi[oó]n|precio de lista|TrackChain|trackchain/i;
const DESTINO_PROHIBIDO = /href="\/(?:seguimiento|rastreo|cotizador|cargas-de-retorno)(?:\/|")/;

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function htmlOf(node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(node);
}

function assertAccesible(html: string, nombre: string) {
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${nombre} tiene un h1`);
  assert.match(html, /<h2[\s>]/, `${nombre} tiene h2`);
  assert.doesNotMatch(html, /<a\b[^>]*>\s*<\/a>/, `${nombre} sin enlaces vacíos`);
  assert.doesNotMatch(html, /<button\b[^>]*>\s*<\/button>/, `${nombre} sin botones vacíos`);
  assert.doesNotMatch(html, /<img\b(?![^>]*\balt=)/, `${nombre} imágenes con alt`);
  assert.doesNotMatch(html, /tabindex="?\d+/i, `${nombre} sin tabindex positivo`);
  assert.doesNotMatch(html, DESTINO_PROHIBIDO, `${nombre} sin destinos prohibidos`);
  assert.doesNotMatch(html, PRICE, `${nombre} sin precios`);
  assert.doesNotMatch(html, /\[ESTADO|\[REQUIERE|\[DESTINO|\[ENLACE|\[NOMBRE/, `${nombre} sin etiquetas internas`);
  for (const button of html.match(/<button\b[\s\S]*?<\/button>/g) || []) {
    assert.match(button, /disabled/, `${nombre} botón pendiente deshabilitado`);
    assert.match(button, />[^<][^]*</, `${nombre} botón con nombre`);
  }
  for (const link of html.match(/<a\b[^>]*>/g) || []) {
    assert.match(link, /href="\/[^"]+"/, `${nombre} enlace con destino`);
  }
}

test("el flag de las vistas solo acepta el texto exacto true", () => {
  assert.equal(paginasOpsEnabled({}), false);
  assert.equal(paginasOpsEnabled({ UI_PAGINAS_OPS_ENABLED: "false" }), false);
  assert.equal(paginasOpsEnabled({ UI_PAGINAS_OPS_ENABLED: "TRUE" }), false);
  assert.equal(paginasOpsEnabled({ UI_PAGINAS_OPS_ENABLED: "1" }), false);
  assert.equal(paginasOpsEnabled({ UI_PAGINAS_OPS_ENABLED: "yes" }), false);
  assert.equal(paginasOpsEnabled({ UI_PAGINAS_OPS_ENABLED: " true" }), false);
  assert.equal(paginasOpsEnabled({ UI_PAGINAS_OPS_ENABLED: "true" }), true);

  for (const ruta of ["/operaciones", "/tracking", "/transportistas"]) {
    assert.equal(paginasOpsHidden(ruta, {}), true, ruta);
    assert.equal(paginasOpsHidden(`${ruta}/`, { UI_PAGINAS_OPS_ENABLED: "TRUE" }), true, ruta);
    assert.equal(paginasOpsHidden(`${ruta}?x=1`, { UI_PAGINAS_OPS_ENABLED: "true" }), false, ruta);
  }
  assert.equal(paginasOpsHidden("/", {}), false);
  assert.equal(paginasOpsHidden("/ingreso", {}), false);
  assert.equal(paginasOpsHidden("/login", {}), false);
  assert.equal(paginasOpsHidden("/agente-360go", {}), false);
  assert.equal(paginasOpsHidden("/seguimiento", {}), false);
  assert.equal(paginasOpsHidden("/seguimiento/abc", {}), false);
  assert.equal(paginasOpsHidden("/admin/transportistas", {}), false);
  assert.equal(paginasOpsHidden("/registro-transportista", {}), false);
  assert.equal(paginasOpsHidden("/sistema", { UI_PAGINAS_OPS_ENABLED: "true" }), false);

  const example = read(".env.example");
  assert.match(example, /^UI_PAGINAS_OPS_ENABLED=false$/m);
});

test("las páginas quedan en 404 real salvo el flag y no se enlazan desde el cascarón", () => {
  for (const file of ["src/app/operaciones/page.tsx", "src/app/tracking/page.tsx", "src/app/transportistas/page.tsx"]) {
    const page = read(file);
    assert.match(page, /notFound\(/);
    assert.match(page, /paginasOpsHidden/);
    assert.match(page, /force-dynamic/);
    assert.match(page, /noindex|index: false/);
    assert.doesNotMatch(page, PRICE);
  }
  for (const file of [
    "src/components/Header.tsx",
    "src/components/Footer.tsx",
    "src/app/sitemap.ts",
    "src/app/page.tsx",
    "src/components/PrivacyGate.tsx",
    "src/components/LoginForm.tsx",
    "src/app/ingreso/page.tsx",
  ]) {
    const source = read(file);
    assert.equal(source.includes('href="/operaciones"'), false, file);
    assert.equal(source.includes('href="/tracking"'), false, file);
    assert.equal(source.includes('href="/transportistas"'), false, file);
    assert.equal(source.includes("UI_PAGINAS_OPS_ENABLED"), false, file);
  }
});

test("operaciones renderiza el cascarón vacío, sin cifras inventadas", () => {
  const html = htmlOf(createElement(OperacionesVista));
  assertAccesible(html, "operaciones");
  assert.match(html, /<h1>Operaciones<\/h1>/);
  assert.match(html, /aria-label="Indicadores"/);
  assert.match(html, /aria-label="Línea de tiempo"/);
  assert.match(html, /aria-label="Centro de alertas"/);
  assert.match(html, /<caption>Tabla<\/caption>/);
  assert.match(html, /Sin datos/);
  assert.match(html, /href="\/terminos"/);
  assert.match(html, /href="\/privacidad"/);
  assert.match(html, /El seguimiento del viaje no está activo/);
  assert.doesNotMatch(html, /\b\d{2,}\b/);
  assert.doesNotMatch(html, /Próximamente/);
});

test("tracking usa el texto del rediseño, la insignia y la alternativa segura", () => {
  const html = htmlOf(createElement(TrackingVista));
  assertAccesible(html, "tracking");
  assert.match(html, /class="badge-f">Próximamente</);
  assert.match(html, /<h1>Seguimiento de tus viajes: próximamente en Carga360go\.<\/h1>/);
  assert.match(html, /Mientras lo preparamos, cada operación ya registra sus hitos con fecha y hora/);
  assert.match(html, /Trazabilidad de la operación, de la publicación a la adjudicación/);
  assert.match(html, /no corresponden a una ubicación GPS/);
  assert.match(html, /Para saber dónde va el camión, coordina con el transportista adjudicado o escríbenos\./);
  assert.match(html, /La hora de llegada la coordinan las partes\./);
  assert.match(html, /El comprobante de entrega lo coordina una persona del equipo de Carga360go\./);
  assert.match(html, /¿Puedo ver hoy mi camión en un mapa\?/);
  assert.match(html, /el Agente Carga360go te deriva a una persona del equipo/);
  assert.match(html, /Te avisamos apenas el seguimiento esté activo\./);
  assert.match(html, /href="\/agente-360go"/);
  assert.match(html, /Escribirle al Agente Carga360go/);
  assert.match(html, /href="\/terminos"/);
  assert.match(html, /href="\/privacidad"/);
  assert.equal((html.match(/Avísame cuando esté disponible/g) || []).length, 2);
  assert.doesNotMatch(html, /Ves dónde va tu carga sin llamar al conductor/);
  assert.doesNotMatch(html, /Hora estimada de llegada \(ETA\) para coordinar la recepción/);
  assert.doesNotMatch(html, /sin papeles sueltos/);
  assert.doesNotMatch(html, /href="\/registro"/);
});

test("transportistas usa el texto aprobado y no afirma funciones apagadas", () => {
  const html = htmlOf(createElement(TransportistasVista));
  assertAccesible(html, "transportistas");
  assert.doesNotMatch(html, /badge-f|>Próximamente</);
  assert.match(html, /<h1>Carga360go: más viajes que calzan con tu camión, y tu buen trabajo a la vista\.<\/h1>/);
  assert.match(html, /Publica tu camión o tu retorno, recibe cargas que calzan con tu equipo y tu ruta/);
  assert.match(html, /href="\/camiones\/nuevo"/);
  assert.match(html, /Publica tu camión o tu retorno/);
  assert.match(html, />Completa tu ficha de equipo</);
  assert.match(html, /Los hitos de tu operación quedan registrados con fecha y hora\./);
  assert.match(html, /La hora de llegada la coordinas directo con el mandante que te adjudicó\./);
  assert.match(html, /condiciones claras antes de partir, con acuerdos por ruta y zona y niveles de servicio por escrito\./);
  assert.match(html, /tu cumplimiento queda registrado, y un buen historial te ayuda a ser elegido\./);
  assert.match(html, /Carga360go te puede proponer para cargas que calzan, incluidos los retornos\./);
  assert.match(html, /Inscríbete y completa la ficha de tu camión\./);
  assert.match(html, /Haz el viaje y coordina el cierre directo con el mandante\./);
  assert.match(html, /Lo que ya tienes en Carga360go/);
  assert.match(html, /Es una recomendación: no siempre habrá carga en cada fecha\./);
  assert.match(html, /Carga360go no impone el precio\./);
  assert.match(html, /El mandante ve tu contacto solo si te adjudica\./);
  assert.match(html, /Calama, Antofagasta y Copiapó/);
  assert.match(html, /¿Quién fija el valor del viaje\?/);
  assert.match(html, /No vuelvas vacío\. Publica tu retorno hoy\./);
  assert.match(html, /href="\/cargas"/);
  assert.match(html, /Ver cargas vigentes/);
  assert.match(html, /href="\/terminos"/);
  assert.match(html, /href="\/privacidad"/);
  assert.doesNotMatch(html, /menos llamadas preguntando dónde vas/);
  assert.doesNotMatch(html, /el cliente sabe a qué hora llegas/);
  assert.doesNotMatch(html, /ciérralo con la evidencia de entrega/);
  assert.doesNotMatch(html, /href="\/registro"/);
  assert.equal((html.match(/<ol>/g) || []).length, 1);
  assert.match(html, /<summary>/);
});

test("el middleware corta las tres rutas con 404 real cuando el flag no es true", async () => {
  const previous = process.env.UI_PAGINAS_OPS_ENABLED;
  try {
    for (const ruta of ["/operaciones", "/tracking", "/transportistas"]) {
      for (const value of [undefined, "false", "TRUE", "1", "yes", " true"]) {
        if (value === undefined) delete process.env.UI_PAGINAS_OPS_ENABLED;
        else process.env.UI_PAGINAS_OPS_ENABLED = value;
        const response = await middleware(new NextRequest(`http://127.0.0.1:4317${ruta}`));
        assert.equal(response.status, 404, `${ruta} ${String(value)}`);
        const html = await response.text();
        assert.match(html, /No encontramos esa página/);
        assert.doesNotMatch(html, /Seguimiento de tus viajes|más viajes que calzan|Operaciones/);
      }
    }
    process.env.UI_PAGINAS_OPS_ENABLED = "true";
    for (const ruta of ["/operaciones", "/tracking", "/transportistas", "/", "/ingreso", "/agente-360go"]) {
      const response = await middleware(new NextRequest(`http://127.0.0.1:4317${ruta}`));
      assert.notEqual(response.status, 404, ruta);
    }
    delete process.env.UI_PAGINAS_OPS_ENABLED;
    const ingreso = await middleware(new NextRequest("http://127.0.0.1:4317/ingreso"));
    assert.notEqual(ingreso.status, 404);
  } finally {
    if (previous === undefined) delete process.env.UI_PAGINAS_OPS_ENABLED;
    else process.env.UI_PAGINAS_OPS_ENABLED = previous;
  }
});
