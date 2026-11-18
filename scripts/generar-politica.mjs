#!/usr/bin/env node
// Regenera el DOCX y el PDF de la Política de Privacidad (o de los Términos de uso) desde el texto del código
// (src/lib/privacy-policy.ts, src/lib/terms.ts), con el mismo procedimiento con que se generaron los archivos de public/.
//
//   node scripts/generar-politica.mjs --out <carpeta>                 # Política de Privacidad -> <carpeta>/carga360go-politica-privacidad.{docx,pdf}
//   node scripts/generar-politica.mjs --out <carpeta> --documento terminos
//   node scripts/generar-politica.mjs --out public --publicar         # SOLO tras aprobación: sobrescribe los archivos publicados
//
// Opciones: --pagos (PAYMENTS_LEGAL_PUBLISHED=true) y --kyc (KYC_FEATURE_ENABLED=true) fijan los interruptores que cambian el texto
// y la versión (sin ellas se usa el entorno actual). Los archivos publicados con la versión 1.7 se generaron con --pagos y sin --kyc.
// Por seguridad, sin --publicar el script se niega a escribir en public/.
// Requiere: Node + tsx (devDependency), python3 con python-docx y LibreOffice (soffice).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (m) => {
  console.error(`generar-politica: ${m}`);
  process.exit(1);
};

const documento = opt("--documento") || "privacidad";
const docs = {
  privacidad: { json: "privacy", base: "carga360go-politica-privacidad" },
  terminos: { json: "terms", base: "carga360go-terminos-uso" },
};
if (!docs[documento]) fail(`--documento debe ser "privacidad" o "terminos".`);
const out = opt("--out");
if (!out) fail("falta --out <carpeta>. Ejemplo: --out ../diseno/politica-preview");
const outDir = path.resolve(root, out);
const publicDir = path.join(root, "public");
if (path.relative(publicDir, outDir) === "" || !path.relative(publicDir, outDir).startsWith("..")) {
  if (!flag("--publicar")) fail("--out apunta a public/: eso reemplaza los archivos publicados. Usa otra carpeta o añade --publicar (solo con aprobación).");
}
fs.mkdirSync(outDir, { recursive: true });

const env = { ...process.env };
if (flag("--pagos")) env.PAYMENTS_LEGAL_PUBLISHED = "true";
if (flag("--kyc")) env.KYC_FEATURE_ENABLED = "true";

const tsx = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const gen = spawnSync(tsx, ["scripts/legal-json.ts", docs[documento].json], { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (gen.status !== 0) fail(`legal-json.ts falló:\n${gen.stderr}`);
const data = JSON.parse(gen.stdout);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c360-legal-"));
const jsonPath = path.join(tmp, `${docs[documento].json}.json`);
fs.writeFileSync(jsonPath, gen.stdout);

const py = spawnSync("python3", ["scripts/export-legal-docs.py", jsonPath, outDir, docs[documento].base], { cwd: root, env, encoding: "utf8" });
fs.rmSync(tmp, { recursive: true, force: true });
if (py.status !== 0) fail(`export-legal-docs.py falló (¿python-docx y soffice instalados?):\n${py.stdout}${py.stderr}`);

console.log(`Versión ${data.meta.version} (${data.meta.updated})`);
for (const ext of ["docx", "pdf"]) console.log(path.join(outDir, `${docs[documento].base}.${ext}`));
