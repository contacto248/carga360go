import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { agenteVisible } from "../src/components/AgenteAcreditacion";
import { listarEmpresasPublicas } from "../src/lib/empresas-directorio";

test("el directorio público muestra las 25 empresas en acreditación, sin contacto ni sello", () => {
  const archivo = new URL("../src/lib/empresas-gerencia.json", import.meta.url);
  const servidor = JSON.parse(fs.readFileSync(archivo, "utf8")) as Record<string, unknown>[];
  assert.equal(servidor.length, 25);
  for (const fila of servidor) {
    assert.deepEqual(Object.keys(fila).sort(), ["direccion", "estado", "nombre", "rubro", "rut"]);
    assert.equal(fila.estado, "en_acreditacion");
  }

  const empresas = listarEmpresasPublicas();
  assert.equal(empresas.length, 25);
  const codelco = empresas.find((empresa) => empresa.nombre === "Codelco");
  assert.ok(codelco);
  assert.equal(codelco.rut, "61.704.000-K");
  assert.equal(codelco.direccion, "Huérfanos 1270, Santiago");
  assert.equal(codelco.rubro, "Minería Cobre");
  assert.deepEqual(Object.keys(codelco).sort(), ["direccion", "estado", "nombre", "rol", "rubro", "rut"]);
  assert.equal(empresas.every((empresa) => empresa.estado === "en_acreditacion" && empresa.rol === "mandante"), true);

  const publico = JSON.stringify(empresas);
  assert.doesNotMatch(publico, /mail|telefono|cargas_mes|cert/);

  const page = fs.readFileSync(new URL("../src/app/empresas/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Postular a sus cargas/);
  assert.match(page, /href="\/registro-transportista"/);
  assert.match(page, /EN PROCESO DE ACREDITACIÓN Carga360go/);
  assert.doesNotMatch(page, /CARGA360GO|BASSAM 360/);
  assert.doesNotMatch(page, /certificada|whatsapp|mailto|empresas-gerencia/i);
  assert.doesNotMatch(page, /precio|tarifa|CLP|\$/i);
});

test("el Agente BASSAM 360 solo se muestra en /admin/* y /mi-cuenta", () => {
  assert.equal(agenteVisible("/"), false);
  assert.equal(agenteVisible("/empresas"), false);
  assert.equal(agenteVisible("/faq"), false);
  assert.equal(agenteVisible(null), false);
  assert.equal(agenteVisible("/administracion"), false);
  assert.equal(agenteVisible("/admin"), true);
  assert.equal(agenteVisible("/admin/bassam"), true);
  assert.equal(agenteVisible("/mi-cuenta"), true);
});
