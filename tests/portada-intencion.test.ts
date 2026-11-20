import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  ingresoRetomando,
  leerBorrador,
  resumenSigueVigente,
  rutaConBorrador,
  validarBorrador,
} from "../src/lib/portada-intencion";

const base = { rol: "carga" as const, origen: "Santiago", destino: "Antofagasta", equipo: "rampla_plana" };

test("el borrador de portada arma una ruta interna y no publica", () => {
  const parsed = validarBorrador(base);
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;
  const ruta = rutaConBorrador(parsed);
  assert.match(ruta, /^\/cargas\/nueva\?/);
  assert.match(ruta, /origen=Santiago/);
  assert.match(ruta, /destino=Antofagasta/);
  assert.match(ruta, /equipo=rampla_plana/);
  assert.doesNotMatch(ruta, /^https?:/);
  const ingreso = ingresoRetomando(ruta);
  assert.match(ingreso, /^\/ingreso\?next=/);
  assert.equal(resumenSigueVigente(parsed, base), true);
  assert.equal(resumenSigueVigente(parsed, { ...base, origen: "Antofagasta", destino: "Santiago" }), false);
});

test("origen y destino iguales, o un equipo de otro perfil, no arman borrador", () => {
  const igual = validarBorrador({ ...base, destino: "Santiago" });
  assert.ok("error" in igual);
  const ajeno = validarBorrador({ ...base, rol: "transporte", equipo: "portaautos" });
  assert.ok("error" in ajeno);
  assert.equal(leerBorrador({ origen: "Santiago", destino: "Santiago", equipo: "rampla_plana" }, "carga"), null);
  const ok = leerBorrador({ origen: "La Serena", destino: "Puerto Montt", equipo: "cama_baja" }, "transporte");
  assert.equal(ok?.destino, "Puerto Montt");
  const camion = ok ? rutaConBorrador(ok) : "";
  assert.match(camion, /^\/camiones\/nuevo\?/);
});

test("el cascarón sigue la ruta del cliente y el borrador se olvida al usarse", () => {
  const frame = fs.readFileSync(new URL("../src/components/AppFrame.tsx", import.meta.url), "utf8");
  const header = fs.readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
  const retomar = fs.readFileSync(new URL("../src/components/RetomarBorrador.tsx", import.meta.url), "utf8");
  const carga = fs.readFileSync(new URL("../src/components/LoadForm.tsx", import.meta.url), "utf8");
  const camion = fs.readFileSync(new URL("../src/components/TruckForm.tsx", import.meta.url), "utf8");
  assert.match(frame, /usePathname/);
  assert.match(frame, /portada-body/);
  assert.match(header, /pathname === "\/"/);
  assert.match(retomar, /olvidarBorrador/);
  assert.match(carga, /olvidarBorrador/);
  assert.match(camion, /olvidarBorrador/);
});
