import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { upsertAdmin } from "../src/lib/auth";
import { rutDv } from "../src/lib/format";
import { panelOrbita } from "../src/lib/control/panel-orbita";

test("el centro ÓRBITA no inventa cifras y marca el QR y el OCR", () => {
  const admin = upsertAdmin({
    email: "orbita-panel@example.test",
    password: "Camino-Largo-QA-2026",
    razonSocial: "QA ÓRBITA",
    rut: `76.543.210-${rutDv("76543210")}`,
    contactName: "QA",
    whatsapp: "+56911112222",
    city: "Santiago",
  });
  const datos = panelOrbita(admin);
  assert.equal(datos.kpis.length, 6);
  for (const kpi of datos.kpis) {
    assert.match(kpi.valor, /^(--|\d+)$/);
    if (kpi.valor !== "--") assert.notEqual(kpi.valor, "0");
  }
  assert.equal(datos.flujo.find((paso) => paso.id === "qr")?.valor, "No disponible");
  assert.equal(datos.automatizaciones.find((item) => item.nombre === "OCR")?.estado, "No disponible");
  assert.equal(datos.automatizaciones.find((item) => item.nombre === "GPS")?.estado, "Probada en test");
  const texto = JSON.stringify(datos);
  assert.doesNotMatch(texto, /comisi[oó]n|membres[ií]a|BASSAM/i);
  assert.throws(() => panelOrbita({ ...admin, role: "mandante" }));
});

test("el panel y la página de administración no usan azul ni BASSAM", () => {
  const css = fs.readFileSync(new URL("../src/components/control/panel-orbita.module.css", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../src/app/admin/page.tsx", import.meta.url), "utf8");
  const vista = fs.readFileSync(new URL("../src/components/control/PanelOrbita.tsx", import.meta.url), "utf8");
  const header = fs.readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
  assert.match(css, /#ff5001/i);
  assert.match(css, /#000/);
  assert.match(css, /#0b0b0c/i);
  assert.doesNotMatch(css, /#0b1633|#002451|#79b7e9|#0e7490|#22b8cf|#67e8f9|blue|navy/i);
  assert.match(page, /PanelOrbita/);
  assert.match(page, /AdminConsole/);
  assert.match(page, /user\.role !== "admin"/);
  assert.match(vista, /ÓRBITA/);
  assert.match(vista, /Autorizar/);
  assert.match(vista, /\/admin\/costos/);
  assert.doesNotMatch(page + vista + header, /BASSAM|empresa=bassam/);
});
