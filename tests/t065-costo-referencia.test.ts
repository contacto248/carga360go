import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const TEXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".md", ".json", ".html"]);

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "tests" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...filesUnder(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx") || entry.name.endsWith(".spec.ts")) continue;
    if (!TEXT.has(path.extname(entry.name))) continue;
    out.push(full);
  }
  return out;
}

test("T-065: «costo real» no reaparece en src/", () => {
  const hits: string[] = [];
  for (const file of filesUnder(SRC)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/costo real/i.test(line)) hits.push(`${path.relative(ROOT, file)}:${index + 1}`);
    });
  }
  assert.deepEqual(hits, [], `«costo real» volvió a aparecer en src/:\n${hits.join("\n")}`);
});
