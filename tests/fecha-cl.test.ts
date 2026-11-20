import assert from "node:assert/strict";
import { test } from "node:test";
import { fechaChilenaAIso } from "../src/lib/fecha-cl";

test("la fecha chilena dd-mm-aaaa pasa a ISO y rechaza mm/dd/yyyy", () => {
  assert.equal(fechaChilenaAIso("20-11-2026"), "2026-11-20");
  assert.equal(fechaChilenaAIso(" 01-02-2026 "), "2026-02-01");
  assert.equal(fechaChilenaAIso("11/20/2026"), null);
  assert.equal(fechaChilenaAIso("2026-11-20"), null);
  assert.equal(fechaChilenaAIso("31-02-2026"), null);
  assert.equal(fechaChilenaAIso("00-01-2026"), null);
  assert.equal(fechaChilenaAIso(""), null);
});
