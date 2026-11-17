import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BandejaVacia } from "../src/components/paginas/BandejaVacia";
import { ClientesVista } from "../src/components/paginas/ClientesVista";

const root = process.cwd();
const PRICE = /\$\s?\d|CLP\s*\d|comisi[oó]n|precio de lista|TrackChain|trackchain/i;
const FORBIDDEN = /href="\/(seguimiento|rastreo|cotizador|cargas-de-retorno)(\/|")/;
const CLAIMS = [
  "sigue el viaje hasta el cierre",
  "ves dónde va tu carga sin llamar al conductor",
  "sabes a qué hora llega",
  "Sigue el viaje y su ETA",
  "Cierra el viaje con la evidencia de entrega",
  "Agente Carga360go",
  "[ESTADO]",
  "[REQUIERE FUNCIÓN ACTIVA]",
  "[DESTINO POR CONFIRMAR]",
  "[ENLACE LEGAL EXISTENTE]",
  "PENDIENTE DE GERENCIA",
  "Próximamente",
  "En piloto",
  "Disponible",
];

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function htmlOf(node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(node);
}

test("Clientes usa el texto seguro, enlaces legales y botones apagados", () => {
  const html = htmlOf(createElement(ClientesVista, { pagosLegales: false }));
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /<h1>Carga360go: tu flete organizado, de la contratación a la entrega\.<\/h1>/);
  assert.match(
    html,
    /Publica tu carga, encuentra el transportista que calza con tu ruta y tu equipo, y ordena ofertas y adjudicación en un solo lugar\./,
  );
  assert.match(html, /Los hitos de tu operación quedan registrados con fecha y hora\./);
  assert.match(html, /La hora de llegada la coordinas con el transportista adjudicado\./);
  assert.match(html, /acuerdos por ruta y zona, con niveles de servicio claros, quedan registrados en un solo lugar\./);
  assert.match(html, /Eliges con información, porque cada transportista tiene un historial de cumplimiento\./);
  assert.match(html, /Carga360go te propone el transportista más adecuado según costo de referencia/);
  assert.match(html, /Recibe ofertas de transportistas acreditados y elige\./);
  assert.match(html, /Adjudica y coordina el viaje directo con el transportista\./);
  assert.match(html, /El historial de la operación queda en tu panel\./);
  assert.match(html, /Lo que ya tienes en Carga360go/);
  assert.match(html, /diésel publicado por la CNE/);
  assert.match(html, /BASSAM 360 te ayuda por <a href="\/agente-360go">chat<\/a> a cotizar y publicar\./);
  assert.match(html, /¿Carga360go transporta mi carga\?/);
  assert.match(html, /Para conocer las condiciones comerciales, escríbenos y te contacta una persona del equipo\./);
  assert.match(html, /href="\/como-verificamos">\/como-verificamos</);
  assert.match(html, /Publica tu carga y encuentra el camión que calza\./);
  assert.match(html, /href="\/cargas\/nueva"/);
  assert.match(html, /href="\/herramientas\/calculadora"/);
  assert.match(html, /href="\/terminos"/);
  assert.match(html, /href="\/privacidad"/);
  assert.equal(html.includes("/politica-de-pagos"), false);
  assert.equal((html.match(/<button type="button" class="btn sec" disabled="">Quiero una demostración<\/button>/g) || []).length, 2);
  assert.equal((html.match(/<ol/g) || []).length, 1);
  assert.ok((html.match(/<h2/g) || []).length >= 5);
  assert.doesNotMatch(html, FORBIDDEN);
  assert.doesNotMatch(html, PRICE);
  for (const claim of CLAIMS) assert.equal(html.includes(claim), false, claim);
  const withLegal = htmlOf(createElement(ClientesVista, { pagosLegales: true }));
  assert.match(withLegal, /href="\/politica-de-pagos"/);
});

test("Documentos y Finanzas quedan vacíos, con nombre accesible y sin precios", () => {
  for (const [titulo, lead] of [
    ["Documentos", "Aquí se listan los documentos de la operación. Hoy no hay registros."],
    ["Finanzas", "Aquí se ordena la operación comercial. Hoy no hay movimientos."],
  ] as const) {
    const html = htmlOf(createElement(BandejaVacia, { titulo, lead, pagosLegales: false }));
    assert.match(html, new RegExp(`<h1>${titulo}</h1>`));
    assert.match(html, new RegExp(lead.replace(".", "\\.")));
    assert.equal((html.match(/<h1/g) || []).length, 1);
    assert.match(html, /aria-label="Indicadores"/);
    assert.match(html, /aria-label="Línea de tiempo"/);
    assert.match(html, /aria-label="Centro de alertas"/);
    assert.match(html, /<caption>Tabla<\/caption>/);
    assert.match(html, /scope="col"/);
    assert.match(html, /<th scope="col">Registro<\/th>/);
    assert.ok((html.match(/Sin datos/g) || []).length >= 4);
    assert.match(html, /href="\/terminos"/);
    assert.match(html, /href="\/privacidad"/);
    assert.match(html, /href="\/como-verificamos"/);
    assert.doesNotMatch(html, FORBIDDEN);
    assert.doesNotMatch(html, PRICE);
    assert.equal(html.includes("/panel/pagos"), false);
    assert.equal(html.includes("Mercado Pago"), false);
  }
});

test("la nav y el sitemap enlazan las tres páginas y no reabren login ni PrivacyGate", () => {
  const header = read("src/components/Header.tsx");
  const sitemap = read("src/app/sitemap.ts");
  for (const href of ["/clientes", "/documentos", "/finanzas"]) {
    assert.match(header, new RegExp(`href: "${href}"`));
    assert.match(sitemap, new RegExp(`"${href}"`));
  }
  assert.doesNotMatch(header, /\/seguimiento|\/rastreo|\/cotizador|\/cargas-de-retorno/);
  const privacy = read("src/components/PrivacyGate.tsx");
  const ingreso = read("src/app/ingreso/page.tsx");
  assert.match(privacy, /export function PrivacyGate/);
  assert.match(ingreso, /Ingresar/);
  for (const file of ["src/app/clientes/page.tsx", "src/app/documentos/page.tsx", "src/app/finanzas/page.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /PrivacyGate|\/ingreso|\/recuperar|\/restablecer/);
    assert.doesNotMatch(source, PRICE);
  }
});
