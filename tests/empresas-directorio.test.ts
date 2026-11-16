import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { listarEmpresasPublicas } from "../src/lib/empresas-directorio";

test("el directorio público muestra las 25 empresas sin contacto ni sello", () => {
  const archivo = new URL("../src/lib/empresas-gerencia.json", import.meta.url);
  const servidor = JSON.parse(fs.readFileSync(archivo, "utf8")) as {
    nombre: string;
    rut: string;
    direccion: string;
    mail: string;
    telefono: string;
    rubro: string;
    cargas_mes: string;
    cert: boolean;
    documentos_verificados: number;
    estado_verificacion: string;
    cargas_mes_verificadas: boolean;
  }[];
  assert.equal(servidor.length, 25);
  assert.equal(servidor.every((fila) => fila.cert === false), true);
  assert.equal(servidor.every((fila) => fila.documentos_verificados === 0), true);
  assert.equal(servidor.every((fila) => fila.estado_verificacion === "pendiente"), true);
  assert.equal(servidor.every((fila) => fila.cargas_mes_verificadas === false), true);

  const empresas = listarEmpresasPublicas();
  assert.equal(empresas.length, 25);
  const codelco = empresas.find((empresa) => empresa.nombre === "Codelco");
  assert.ok(codelco);
  assert.equal(codelco.direccion, "Huérfanos 1270, Santiago");
  assert.equal(codelco.rubro, "Minería Cobre");
  assert.equal(codelco.cargasMes, "--");
  assert.deepEqual(Object.keys(codelco).sort(), ["cargasMes", "direccion", "nombre", "rubro"]);

  const publico = JSON.stringify(empresas);
  for (const fila of servidor) {
    assert.equal(publico.includes(fila.mail), false);
    assert.equal(publico.includes(fila.telefono), false);
    assert.equal(publico.includes(fila.rut), false);
    assert.equal(publico.includes(fila.cargas_mes), false);
  }

  const page = fs.readFileSync(new URL("../src/app/empresas/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Postular a sus cargas/);
  assert.match(page, /href="\/registro"/);
  assert.match(page, /Cargas al mes/);
  assert.doesNotMatch(page, /certificada|verificado|whatsapp|mailto|empresas-gerencia/i);
  assert.equal(page.includes("61.704.000-K"), false);
});
