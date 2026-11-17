import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { selectorRolVisible, textoConversacionAdmin } from "../src/components/AgenteAcreditacion";
import { hrefAdmin, seccionInterna, vistaControl } from "../src/lib/control/secciones";

test("el selector de rol solo vive fuera de administración", () => {
  assert.equal(selectorRolVisible("/mi-cuenta"), true);
  assert.equal(selectorRolVisible("/mi-cuenta/documentos"), true);
  assert.equal(selectorRolVisible("/"), true);
  assert.equal(selectorRolVisible(null), true);
  assert.equal(selectorRolVisible("/admin"), false);
  assert.equal(selectorRolVisible("/admin/bassam"), false);
  assert.equal(selectorRolVisible("/admin/bassam360"), false);
  assert.equal(textoConversacionAdmin("Sin datos. Elige Transportista o Mandante con carga."), "Sin datos.");
  assert.doesNotMatch(textoConversacionAdmin("Elige transportista o mandante con carga."), /transportista|mandante/i);
});

test("las secciones internas rechazan valores ajenos y arman una ruta interna", () => {
  assert.equal(seccionInterna("agente"), "agente");
  assert.equal(seccionInterna("panel"), "panel");
  assert.equal(seccionInterna("bassam360"), "bassam360");
  assert.equal(seccionInterna("usuarios"), "usuarios");
  assert.equal(seccionInterna(["panel", "agente"]), "panel");
  assert.equal(seccionInterna("https://otro.example"), null);
  assert.equal(seccionInterna("../admin"), null);
  assert.equal(seccionInterna(undefined), null);
  assert.equal(vistaControl("tareas"), "tareas");
  assert.equal(vistaControl("borrar"), "resumen");
  assert.equal(hrefAdmin("carga360go"), "/admin");
  assert.equal(hrefAdmin("bassam", { seccion: "agente" }), "/admin?empresa=bassam&seccion=agente");
  assert.equal(hrefAdmin("carga360go", { seccion: "panel" }), "/admin?seccion=panel");
  assert.equal(hrefAdmin("carga360go", { vista: "tareas" }), "/admin?vista=tareas");
  assert.equal(hrefAdmin("carga360go", { seccion: "usuarios", vista: "tareas" }), "/admin?seccion=usuarios");
});

test("las rutas viejas redirigen a la sección y el menú externo queda en Administración", () => {
  const header = fs.readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
  const nav = fs.readFileSync(new URL("../src/components/AdminNav.tsx", import.meta.url), "utf8");
  const bassam = fs.readFileSync(new URL("../src/app/admin/bassam/page.tsx", import.meta.url), "utf8");
  const bassam360 = fs.readFileSync(new URL("../src/app/admin/bassam360/page.tsx", import.meta.url), "utf8");
  const control = fs.readFileSync(new URL("../src/app/admin/control/page.tsx", import.meta.url), "utf8");
  const agente = fs.readFileSync(new URL("../src/components/AgenteAcreditacion.tsx", import.meta.url), "utf8");
  assert.match(header, /Administración/);
  assert.doesNotMatch(header, /Panel BASSAM|Agente BASSAM 360|href="\/admin\/bassam/);
  assert.doesNotMatch(nav, /href: "\/admin\/bassam360"/);
  assert.match(bassam, /\/admin\?seccion=panel/);
  assert.match(bassam, /user\.role !== "admin"/);
  assert.match(bassam360, /\/admin\?seccion=bassam360/);
  assert.match(bassam360, /user\.role !== "admin"/);
  assert.match(control, /redirect\(/);
  assert.match(agente, /selectorRolVisible/);
  assert.match(agente, /modo === "conversacion"/);
  assert.match(agente, /Soy transportista/);
  assert.match(agente, /Soy mandante/);
});
