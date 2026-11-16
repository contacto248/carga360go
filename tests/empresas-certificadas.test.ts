import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { listEmpresasPublicas } from "../src/lib/empresas-certificadas";
import {
  assertPayloadPublico,
  parseEmpresaInterna,
  toEmpresaPublica,
  vistaEmpresa,
  type EmpresaInterna,
} from "../src/lib/empresas-publicas";

const ARCHIVO = path.join("src/data/empresasCertificadasCarga360.json");
const NOTA = "Empresas en proceso de contacto y acreditación. La certificación se muestra solo cuando se completa.";

function leerFuente(): Array<Record<string, unknown>> {
  const raw: unknown = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
  assert.ok(Array.isArray(raw));
  return raw as Array<Record<string, unknown>>;
}

function archivosSrc(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...archivosSrc(full));
    else if (/\.(ts|tsx|css|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function muestra(estado: EmpresaInterna["estado"]): EmpresaInterna {
  return {
    id: 99,
    nombre: "Empresa de prueba",
    rut: "76.000.000-1",
    direccion: "Calle 1, Santiago",
    telefono: "+56 2 2000 0000",
    mail: "secreto@ejemplo.test",
    rubro: "Prueba",
    cargas_mes: "15+",
    estado,
  };
}

test("el padrón trae 25 empresas en acreditación y ya no usa cert", () => {
  const fuente = leerFuente();
  assert.equal(fuente.length, 25);
  assert.deepEqual(
    fuente.map((row) => row.nombre),
    [
      "Codelco",
      "Antofagasta Minerals",
      "SQM",
      "CMPC",
      "Arauco",
      "Cencosud",
      "Falabella / Sodimac",
      "Agrosuper",
      "CCU",
      "Copec",
      "Besalco",
      "SalfaCorp",
      "Walmart Chile",
      "Carozzi",
      "AquaChile",
      "Minera Escondida | BHP",
      "Collahuasi",
      "Anglo American",
      "Sierra Gorda SCM",
      "Teck Quebrada Blanca",
      "Constructora Echeverría Izquierdo",
      "Sigdo Koppers",
      "Enaex",
      "Constructora Gardilcic",
      "Lomas Bayas | Glencore",
    ],
  );
  for (const row of fuente) {
    assert.equal(row.estado, "en_acreditacion");
    assert.equal("cert" in row, false);
    assert.equal(typeof row.mail, "string");
    assert.equal(typeof row.telefono, "string");
    assert.equal(typeof row.cargas_mes, "string");
  }
});

test("el archivo vive en src/data, no en /data ni en public", () => {
  assert.equal(fs.existsSync(ARCHIVO), true);
  assert.equal(fs.existsSync("public/empresasCertificadasCarga360.json"), false);
  assert.equal(fs.existsSync("public/data/empresasCertificadasCarga360.json"), false);
  assert.match(fs.readFileSync(".gitignore", "utf8"), /^\/data$/m);
});

test("la proyección pública omite mail, teléfono y cargas/mes mientras están en acreditación", () => {
  const fuente = leerFuente();
  const publicas = listEmpresasPublicas();
  assert.equal(publicas.length, 25);
  const blob = JSON.stringify(publicas);
  for (const row of fuente) {
    assert.equal(blob.includes(String(row.mail)), false);
    assert.equal(blob.includes(String(row.telefono)), false);
    assert.equal(blob.includes(String(row.cargas_mes)), false);
  }
  for (const empresa of publicas) {
    assert.equal(empresa.estado, "en_acreditacion");
    assert.equal("mail" in empresa, false);
    assert.equal("telefono" in empresa, false);
    assert.equal("cargas_mes" in empresa, false);
    assert.equal("cargasMes" in empresa, false);
    assert.equal("cert" in empresa, false);
    const vista = vistaEmpresa(empresa);
    assert.equal(vista.badge, "EN PROCESO DE ACREDITACIÓN Carga360go");
    assert.equal(vista.badgeClass, "pill warn");
    assert.equal(vista.sello, null);
    assert.equal(vista.cargasMes, null);
  }
});

test("una empresa certificada muestra sello y cargas/mes, sin contacto", () => {
  const interna = muestra("certificada");
  const publica = toEmpresaPublica(interna);
  assertPayloadPublico([publica], [interna.mail, interna.telefono]);
  assert.equal(publica.estado, "certificada");
  if (publica.estado !== "certificada") return;
  assert.equal(publica.cargasMes, "15+");
  const vista = vistaEmpresa(publica);
  assert.equal(vista.badge, "EMPRESA CERTIFICADA Carga360go");
  assert.equal(vista.badgeClass, "pill ok");
  assert.equal(vista.sello, "4 documentos verificados");
  assert.equal(vista.cargasMes, "15+");
  const blob = JSON.stringify(vista);
  assert.equal(blob.includes(interna.mail), false);
  assert.equal(blob.includes(interna.telefono), false);
});

test("en acreditación no publica cargas/mes aunque el padrón las tenga", () => {
  const interna = muestra("en_acreditacion");
  const publica = toEmpresaPublica(interna);
  assert.equal("cargasMes" in publica, false);
  assert.equal(JSON.stringify(publica).includes(interna.cargas_mes), false);
  assert.equal(vistaEmpresa(publica).cargasMes, null);
});

test("rechaza el campo cert y un estado desconocido", () => {
  assert.throws(() => parseEmpresaInterna({ ...muestra("en_acreditacion"), cert: true }, 0), /estado/);
  assert.throws(() => parseEmpresaInterna({ ...muestra("en_acreditacion"), estado: "certificada_parcial" }, 0), /estado/);
});

test("la página no es cliente y no menciona contacto interno", () => {
  const page = fs.readFileSync("src/app/empresas/page.tsx", "utf8");
  assert.equal(page.includes("use client"), false);
  assert.match(page, /Postular a sus cargas/);
  assert.match(page, /href="\/registro-transportista"/);
  assert.ok(page.includes(NOTA));
  assert.equal(page.includes("empresasCertificadasCarga360.json"), false);
  assert.equal(page.includes("telefono"), false);
  assert.equal(page.includes("mail"), false);
});

test("correo y teléfono del padrón no aparecen en el resto del código", () => {
  const fuente = leerFuente();
  const secretos = fuente.flatMap((row) => [String(row.mail), String(row.telefono)]);
  for (const file of archivosSrc("src")) {
    if (file.endsWith(`${path.sep}empresasCertificadasCarga360.json`)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const secreto of secretos) {
      assert.equal(text.includes(secreto), false, `${file} incluye contacto interno`);
    }
  }
});

test("la marca pública del directorio es Carga360go, no BASSAM", () => {
  const page = fs.readFileSync("src/app/empresas/page.tsx", "utf8");
  const lib = fs.readFileSync("src/lib/empresas-publicas.ts", "utf8");
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(page, /Carga360go/);
  assert.doesNotMatch(page, /BASSAM/i);
  assert.doesNotMatch(lib, /BASSAM/i);
  assert.match(lib, /EMPRESA CERTIFICADA Carga360go/);
  assert.match(lib, /EN PROCESO DE ACREDITACIÓN Carga360go/);
  assert.doesNotMatch(lib, /CARGA360GO/);
  assert.match(css, /\.empresa-card/);
  assert.match(css, /\/\* Directorio \/empresas \*\//);
});
