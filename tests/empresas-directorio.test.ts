import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { registerUser } from "../src/lib/auth";
import { listarEmpresasPublicas } from "../src/lib/empresas-directorio";
import { rutDv } from "../src/lib/format";

test("el directorio público no entrega correo, teléfono ni sellos inventados", () => {
  const rut = `15444000-${rutDv("15444000")}`;
  registerUser({
    role: "mandante",
    razonSocial: "Empresa Directorio",
    rut,
    contactName: "Contacto",
    email: "directorio@empresas.test",
    password: "Clave-Segura-Emp-1",
    whatsapp: "+56 9 55556666",
    city: "Santiago",
  });
  const empresas = listarEmpresasPublicas();
  const encontrada = empresas.find((empresa) => empresa.nombre === "Empresa Directorio");
  assert.ok(encontrada);
  assert.deepEqual(Object.keys(encontrada).sort(), ["direccion", "nombre", "rubro", "rut"]);
  assert.equal(encontrada.direccion, "Santiago");
  assert.equal(encontrada.rubro, "--");
  assert.equal(JSON.stringify(empresas).includes("directorio@empresas.test"), false);
  assert.equal(JSON.stringify(empresas).includes("55556666"), false);

  const page = fs.readFileSync(new URL("../src/app/empresas/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Postular a sus cargas/);
  assert.match(page, /href="\/registro"/);
  assert.doesNotMatch(page, /certificada|4 docs verificados|cargas al mes|whatsapp|mailto/i);
});
