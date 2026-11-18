import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("la portada enlaza solo a módulos existentes sin datos ficticios", () => {
  const component = read("../src/components/ExistingModules.tsx");
  assert.match(component, /href: "\/cargas"/);
  assert.match(component, /href: "\/mi-cuenta\?rol=mandante"/);
  assert.match(component, /href: "\/panel"/);
  assert.match(component, /href: "\/admin"/);
  assert.doesNotMatch(component, /OTIF 94%|128 cargas hoy|\$48\.2M/);
});

test("la apariencia está aislada a la portada", () => {
  const style = read("../src/app/modern-home.css");
  const home = read("../src/app/page.tsx");
  assert.match(style, /\.c360-modern-home/);
  assert.match(home, /className="c360-modern-home"/);
  assert.match(home, /<ExistingModules \/>/);
});
