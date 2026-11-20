import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fechaChilenaAIso, isoAFechaChilena } from "../src/lib/fecha-cl";

test("la fecha chilena dd-mm-aaaa pasa a ISO y rechaza mm/dd/yyyy", () => {
  assert.equal(fechaChilenaAIso("20-11-2026"), "2026-11-20");
  assert.equal(fechaChilenaAIso(" 01-02-2026 "), "2026-02-01");
  assert.equal(fechaChilenaAIso("11/20/2026"), null);
  assert.equal(fechaChilenaAIso("2026-11-20"), null);
  assert.equal(fechaChilenaAIso("31-02-2026"), null);
  assert.equal(fechaChilenaAIso("00-01-2026"), null);
  assert.equal(fechaChilenaAIso(""), null);
  assert.equal(isoAFechaChilena("2026-11-20"), "20-11-2026");
  assert.equal(isoAFechaChilena("2026-02-31"), "");
  const filters = fs.readFileSync(new URL("../src/components/Filters.tsx", import.meta.url), "utf8");
  assert.match(filters, /dd-mm-aaaa/);
  assert.match(filters, /lang="es-CL"/);
  assert.doesNotMatch(filters, /type="date"/);
  assert.doesNotMatch(filters, /type=\{field\.kind === "date" \? "date"/);
});
