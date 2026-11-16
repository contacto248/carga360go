import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("T-049/T-065 home: marca, torre de control y flujos sin precios/comisiones", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /brand-hero/);
  assert.match(home, /Carga360go/);
  assert.match(home, /Trazabilidad y automatización/);
  assert.match(home, /Publicar carga/);
  assert.match(home, /Encontrar camión/);
  assert.match(home, /Seguimiento en vivo/);
  assert.match(home, /Eventos registrados con fecha y hora: publicación, ofertas y adjudicación/);
  assert.match(home, /HomeTowerBoard/);
  const tower = read("src/components/HomeTowerBoard.tsx");
  assert.match(tower, /Así funciona/);
  assert.doesNotMatch(home, /tower-tag">en vivo/);
  assert.doesNotMatch(tower, /tower-tag">en vivo/);
  assert.match(home, /Comprobante digital/);
  assert.match(home, /Empresas y mandantes/);
  assert.match(home, /Transportistas/);
  assert.match(home, /Agente Carga360go/);
  assert.match(home, /Decide mejor y más rápido/);
  assert.match(home, /Eficiencia operativa/);
  assert.match(home, /Crece con respaldo/);
  assert.match(home, /Libera recursos y reduce riesgo/);
  assert.match(home, /Funciones de la plataforma/);
  assert.match(home, /Quiénes somos/);
  assert.match(home, /Ecosistema y canales/);
  assert.doesNotMatch(home, /comisi[oó]n/i);
  assert.doesNotMatch(home, /%\s*fee|marketplace fee/i);
  assert.doesNotMatch(home, /TrackChain|trackchain|chain\.io/i);
});

test("T-064 FAB único Carga360 en el pie (sin WhatsApp/Asistente flotantes)", () => {
  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /VoiceAgentLauncher/);
  assert.match(footer, /VoiceAgent/);
  assert.doesNotMatch(footer, /ChatWidget|HelpLauncher|webChatEnabled/);
  const agent = read("src/components/VoiceAgent.tsx");
  assert.match(agent, />Carga360</);
  assert.match(agent, /id=\{titleId\}>Carga360</);
  assert.match(agent, /Carga360go/);
  assert.match(agent, /Continuar por WhatsApp/);
  assert.match(agent, /speechSynthesis/);
  assert.match(agent, /es-CL/);
  assert.match(agent, /es-ES/);
  assert.match(agent, /AgentAvatar/);
  assert.match(agent, /agent-wa-cta/);
  assert.match(agent, /Continuar por WhatsApp/);
  assert.match(agent, /chat-head-copy/);
  assert.match(agent, /chat-head-actions/);
  assert.match(agent, /Escriba o hable/);
  assert.doesNotMatch(agent, /id=\{titleId\}>Carga360go</);
  assert.doesNotMatch(agent, /chat-wa-mini/);
  assert.doesNotMatch(agent, /aiLabel|agent-badge|Respuestas por reglas/);
  assert.doesNotMatch(agent, /status\?\.modeLabel|status\?\.ai ===/);
  assert.doesNotMatch(agent, /help-wa|help-stack|btn wa fab/);
  assert.doesNotMatch(agent, /Agente BASSAM|BASSAM 360/);
  const chat = read("src/components/ChatWidget.tsx");
  assert.match(chat, /return null/);
  assert.doesNotMatch(chat, /help-fab|btn wa fab|help-wa/);
  const css = read("src/app/globals.css");
  assert.match(css, /cookie-banner/);
  assert.match(css, /body:has\(\.cookie-banner\) \.help-dock/);
  assert.match(css, /chat-head-copy/);
  assert.match(css, /chat-head-actions/);
  const engine = read("src/lib/agent/engine.ts");
  assert.match(engine, /bienvenido a Carga360go/);
  assert.doesNotMatch(engine, /bienvenido a CARGA360GO/);
  assert.match(engine, /Cotizar flete/);
  assert.match(engine, /Publicar carga/);
  assert.match(engine, /Registro transportista/);
  assert.match(engine, /Seguimiento de carga/);
  assert.match(engine, /Hablar con soporte/);
  assert.ok(fs.existsSync(path.join(ROOT, "src/components/AgentAvatar.tsx")));
  assert.ok(fs.existsSync(path.join(ROOT, "public/brand/agent-mark.svg")));
  const waDoc = read("docs/diseno-whatsapp-cloud-api-agente.md");
  assert.match(waDoc, /Estado Meta \(16-11-2026, lectura\)/);
  assert.match(waDoc, /Test Messaging Account/);
  assert.match(waDoc, /WA_WABA_ID/);
  assert.match(waDoc, /WA_PHONE_NUMBER_ID/);
  assert.match(waDoc, /WA_ACCESS_TOKEN/);
  assert.doesNotMatch(waDoc, /EAA[A-Za-z0-9]{20,}/);
});

test("T-047 rutas /cotizador y /cargas-de-retorno redirigen (nunca 404)", () => {
  const conf = read("next.config.ts");
  assert.match(conf, /source:\s*"\/cotizador"/);
  assert.match(conf, /destination:\s*"\/herramientas\/calculadora"/);
  assert.match(conf, /source:\s*"\/cargas-de-retorno"/);
  assert.match(conf, /destination:\s*"\/cargas-de-retorno-mineras"/);
});

test("T-062 página /guias existe (hub marketing; nunca 404)", () => {
  const page = path.join(ROOT, "src/app/guias/page.tsx");
  assert.ok(fs.existsSync(page));
  const guias = read("src/app/guias/page.tsx");
  assert.match(guias, /canonical:\s*"\/guias"/);
  assert.match(guias, /Guías de Carga360go/);
  assert.match(guias, /\/como-verificamos/);
  assert.match(guias, /\/herramientas\/calculadora/);
  assert.match(guias, /\/cargas\/nueva/);
  const conf = read("next.config.ts");
  assert.match(conf, /source:\s*"\/guia"/);
  assert.match(conf, /destination:\s*"\/guias"/);
  const sitemap = read("src/app/sitemap.ts");
  assert.match(sitemap, /\/guias/);
  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /href="\/guias"/);
});

test("T-060 página /tecnologia con demos marcadas y controles reales (sin sellos falsos)", () => {
  const page = path.join(ROOT, "src/app/tecnologia/page.tsx");
  assert.ok(fs.existsSync(page));
  const tech = read("src/app/tecnologia/page.tsx");
  assert.match(tech, /Carga360go/);
  assert.match(tech, /Demostración|TraceAutomationDemo/);
  assert.match(tech, /HTTPS|COOKIE_SECURE|Content-Security-Policy|CSP/);
  assert.match(tech, /como-verificamos/);
  assert.match(tech, /No es sello ISO ni SOC 2/);
  assert.doesNotMatch(tech, /certificad[oa]s?\s+ISO|certificaci[oó]n SOC|sello ISO vigente/i);
  assert.doesNotMatch(tech, /Sin cifras de cobro ni comisiones/);
  assert.doesNotMatch(tech, /\$\d|CLP\s*\d|%\s*fee|marketplace fee/i);
  const demo = read("src/components/TraceAutomationDemo.tsx");
  assert.match(demo, /Demostración/);
  assert.match(demo, /DEMO-SEG/);
  assert.match(demo, /No corresponden a cargas/);
  const home = read("src/app/page.tsx");
  assert.match(home, /\/tecnologia/);
  assert.match(home, /TraceAutomationDemo/);
  const sitemap = read("src/app/sitemap.ts");
  assert.match(sitemap, /\/tecnologia/);
});

test("T-061 home referencia video corporativo Carga360go", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /Conoce/);
  assert.match(home, /Carga360go/);
  assert.match(home, /home-video-band/);
  assert.match(home, /\/video\/carga360go-corporativo\.mp4/);
  assert.match(home, /preload="metadata"/);
  assert.match(home, /playsInline/);
  assert.match(home, /aria-label="Video corporativo de Carga360go"/);
  assert.match(home, /poster="\/video\/carga360go-corporativo-poster\.jpg"/);
  assert.match(home, /OpenAgentCta/);
  assert.doesNotMatch(home, /home-video-brand/);
  assert.doesNotMatch(home, /Sin reproducción automática/);
  assert.doesNotMatch(home, /autoPlay|autoplay/i);
  assert.ok(fs.existsSync(path.join(ROOT, "public/video/carga360go-corporativo.mp4")));
  assert.ok(fs.existsSync(path.join(ROOT, "public/video/carga360go-corporativo-poster.jpg")));
});

test("T-065 torre animada y CTA del agente sin segundo FAB", () => {
  const tower = read("src/components/HomeTowerBoard.tsx");
  assert.match(tower, /prefers-reduced-motion/);
  assert.match(tower, /Pausar torre|Reanudar torre/);
  assert.match(tower, /Así funciona/);
  const cta = read("src/components/OpenAgentCta.tsx");
  assert.match(cta, /button\.agent-fab/);
  assert.doesNotMatch(cta, /help-wa|btn wa fab|FAB WhatsApp/i);
});

test("T-066 móvil: FAB no tapa CTA hero; Bolsa reciente con contraste AA", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /hero-v3 \.cta/);
  assert.match(css, /padding-right:calc\(60px/);
  assert.match(css, /home-live-band \.tower-live \.lb-list a/);
  assert.match(css, /#3d4c63/);
  assert.match(css, /home-live-band \.tower-live \.lb-route\{color:#0f1b2d\}/);
  const home = read("src/app/page.tsx");
  assert.match(home, /Soy transportista: encuentra cargas/);
  assert.match(home, /home-live-band/);
  assert.doesNotMatch(home, /TrackChain|trackchain|chain\.io/i);
});

test("franja superior y FreeBanner no hablan de precios ni comisiones", () => {
  const header = read("src/components/Header.tsx");
  assert.match(header, /Costo real y automático del flete/);
  // Solo el JSX visible del banner superior (no comentarios de código).
  const headerBanner = header.match(/demo-banner[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(headerBanner, /Costo real y automático del flete/);
  assert.doesNotMatch(headerBanner, /\$\d|CLP\s*\d|comisi[oó]n|membres[ií]a|precio de lista/i);
  const banner = read("src/components/FreeBanner.tsx");
  assert.match(banner, /Costo real y automático del flete/);
  const visible = banner.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(visible, /\$\d|CLP\s*\d|comisi[oó]n|%\s*fee/i);
});
