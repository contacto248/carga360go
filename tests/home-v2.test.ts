import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("T-049 home v2: marca, torre de control y flujos sin precios/comisiones", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /brand-hero/);
  assert.match(home, /Carga360go/);
  assert.match(home, /Trazabilidad y automatización/);
  assert.match(home, /Publicar carga/);
  assert.match(home, /Encontrar camión/);
  assert.match(home, /Seguimiento en vivo/);
  assert.match(home, /Comprobante digital/);
  assert.match(home, /Empresas y mandantes/);
  assert.match(home, /Transportistas/);
  assert.match(home, /Agente Carga360go/);
  assert.doesNotMatch(home, /comisi[oó]n/i);
  assert.doesNotMatch(home, /%\s*fee|marketplace fee/i);
});

test("T-049 solo Agente Carga360go en el pie (sin ChatWidget)", () => {
  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /VoiceAgentLauncher/);
  assert.match(footer, /Agente Carga360go|VoiceAgent/);
  assert.doesNotMatch(footer, /ChatWidget|HelpLauncher|webChatEnabled/);
  const agent = read("src/components/VoiceAgent.tsx");
  assert.match(agent, /Agente Carga360go/);
  assert.match(agent, /speechSynthesis/);
  assert.match(agent, /es-CL/);
  assert.match(agent, /es-ES/);
  assert.match(agent, /AgentAvatar/);
  assert.ok(fs.existsSync(path.join(ROOT, "src/components/AgentAvatar.tsx")));
  assert.ok(fs.existsSync(path.join(ROOT, "public/brand/agent-mark.svg")));
});

test("T-047 rutas /cotizador y /cargas-de-retorno redirigen (nunca 404)", () => {
  const conf = read("next.config.ts");
  assert.match(conf, /source:\s*"\/cotizador"/);
  assert.match(conf, /destination:\s*"\/herramientas\/calculadora"/);
  assert.match(conf, /source:\s*"\/cargas-de-retorno"/);
  assert.match(conf, /destination:\s*"\/cargas-de-retorno-mineras"/);
});
