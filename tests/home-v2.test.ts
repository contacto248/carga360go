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
  assert.match(home, /Cargas, camiones y retornos en una sola torre de control, de Arica a Punta Arenas\./);
  assert.match(home, /Publicar carga/);
  assert.match(home, /Encontrar camión/);
  assert.match(home, /Historial de eventos/);
  assert.doesNotMatch(home, /Seguimiento en vivo/);
  assert.match(home, /registra publicación, ofertas y adjudicación con fecha y hora/);
  assert.match(home, /HomeTowerBoard/);
  assert.match(home, /compact/);
  const tower = read("src/components/HomeTowerBoard.tsx");
  assert.match(tower, /Así funciona/);
  assert.match(tower, /tower-board-compact/);
  assert.doesNotMatch(home, /tower-tag">en vivo/);
  assert.doesNotMatch(tower, /tower-tag">en vivo/);
  assert.match(home, /Historial en tu panel/);
  assert.doesNotMatch(home, /Comprobante digital/);
  assert.doesNotMatch(home, /costo real/i);
  assert.match(home, /Empresas y mandantes/);
  assert.match(home, /Transportistas/);
  assert.match(home, /AI\.CARGA360/);
  assert.match(home, /Decide mejor y más rápido/);
  assert.match(home, /Eficiencia operativa/);
  assert.match(home, /Crece con respaldo/);
  assert.match(home, /Libera recursos y reduce riesgo/);
  assert.match(home, /\/tecnologia/);
  assert.doesNotMatch(home, /comisi[oó]n/i);
  assert.doesNotMatch(home, /membres[ií]a/i);
  assert.doesNotMatch(home, /%\s*fee|marketplace fee/i);
  assert.doesNotMatch(home, /TrackChain|trackchain|chain\.io/i);
  assert.match(home, /id="faq"/);
  assert.match(home, /Escribe a AI\.CARGA360/);
  assert.doesNotMatch(home, /Hablar con el Agente|También puede hablarte/i);
  // Portada corta: verticales/equipos viven en /tecnologia (no en el fold).
  assert.doesNotMatch(home, /Equipos con ficha técnica/);
  assert.doesNotMatch(home, /Industrias que mueven carga/);
  assert.doesNotMatch(home, /FreeBanner/);
});

test("T-064 FAB único Carga360 en el pie (sin WhatsApp/Asistente flotantes)", () => {
  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /VoiceAgentLauncher/);
  assert.match(footer, /VoiceAgent/);
  assert.doesNotMatch(footer, /ChatWidget|HelpLauncher|webChatEnabled/);
  const agent = read("src/components/VoiceAgent.tsx");
  assert.match(agent, />AI\.CARGA360</);
  assert.match(agent, /id=\{titleId\}>AI\.CARGA360</);
  assert.match(agent, /\/agente-360go/);
  assert.match(agent, /Carga360go/);
  assert.match(agent, /Continuar por WhatsApp/);
  assert.match(agent, /speechSynthesis/);
  assert.match(agent, /es-CL/);
  assert.match(agent, /es-ES/);
  assert.match(agent, /AgentAvatar/);
  assert.match(agent, /AgentAvatarStage/);
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
  assert.match(css, /cookie-banner-compact|padding:6px 0/);
  assert.match(css, /body:has\(\.cookie-banner\) \.help-dock/);
  assert.match(css, /body:has\(\.cookie-banner\)\{padding-bottom/);
  assert.match(css, /bottom:calc\(56px \+ env\(safe-area-inset-bottom/);
  assert.match(css, /goog-te-banner-frame/);
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
  assert.ok(fs.existsSync(path.join(ROOT, "src/components/AgentAvatarStage.tsx")));
  assert.ok(fs.existsSync(path.join(ROOT, "src/lib/agent/avatar.ts")));
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

test("T-066 alias E2E /seguimiento /login /ayuda /registro-transportista; /faq tiene página", () => {
  const conf = read("next.config.ts");
  assert.doesNotMatch(conf, /source:\s*"\/empresas"/);
  assert.match(conf, /source:\s*"\/seguimiento"/);
  assert.match(conf, /destination:\s*"\/tecnologia"/);
  assert.match(conf, /source:\s*"\/login"/);
  assert.match(conf, /destination:\s*"\/ingreso"/);
  assert.match(conf, /source:\s*"\/ayuda"/);
  assert.match(conf, /destination:\s*"\/guias"/);
  assert.match(conf, /source:\s*"\/registro-transportista"/);
  assert.match(conf, /destination:\s*"\/registro"/);
  assert.ok(fs.existsSync(path.join(ROOT, "src/app/faq/page.tsx")));
  const faqPage = read("src/app/faq/page.tsx");
  assert.match(faqPage, /canonical:\s*"\/faq"/);
  assert.match(faqPage, /Preguntas frecuentes/);
  assert.match(faqPage, /from "\@\/lib\/faq"/);
  const faqLib = read("src/lib/faq.ts");
  assert.doesNotMatch(faqLib, /membres[ií]a|comisi[oó]n|TrackChain/i);
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
  assert.match(tech, /id="verticales"/);
  assert.match(tech, /Equipos con ficha técnica/);
  assert.match(tech, /\/transporte-minero-chile/);
  assert.doesNotMatch(tech, /certificad[oa]s?\s+ISO|certificaci[oó]n SOC|sello ISO vigente/i);
  assert.doesNotMatch(tech, /Sin cifras de cobro ni comisiones/);
  assert.doesNotMatch(tech, /\$\d|CLP\s*\d|%\s*fee|marketplace fee/i);
  const demo = read("src/components/TraceAutomationDemo.tsx");
  assert.match(demo, /Demostración/);
  assert.match(demo, /DEMO-SEG/);
  assert.match(demo, /No corresponden a cargas/);
  const home = read("src/app/page.tsx");
  assert.match(home, /\/tecnologia/);
  assert.doesNotMatch(home, /TraceAutomationDemo/);
  const sitemap = read("src/app/sitemap.ts");
  assert.match(sitemap, /\/tecnologia/);
});

test("T-061 video corporativo permanece en assets públicos (portada corta no lo embebe)", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "public/video/carga360go-corporativo.mp4")));
  assert.ok(fs.existsSync(path.join(ROOT, "public/video/carga360go-corporativo-poster.jpg")));
  const home = read("src/app/page.tsx");
  assert.doesNotMatch(home, /home-video-band/);
  assert.doesNotMatch(home, /autoPlay|autoplay/i);
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

test("T-066 móvil: FAB no tapa CTA hero; Bolsa reciente con contraste AA; un CTA principal", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /hero-v3 \.cta/);
  assert.match(css, /padding-right:calc\(60px/);
  assert.match(css, /home-live-band \.tower-live \.lb-list a/);
  assert.match(css, /#3d4c63/);
  assert.match(css, /home-live-band \.tower-live \.lb-route\{color:#0f1b2d\}/);
  assert.match(css, /hero-fold/);
  assert.match(css, /tower-board-compact/);
  assert.match(css, /mobile-cta/);
  const home = read("src/app/page.tsx");
  assert.match(home, /Tengo camión o retorno/);
  assert.match(home, /Abrir el cotizador/);
  assert.match(home, /home-live-band/);
  assert.match(home, /hero-fold/);
  assert.match(home, /href="\/cargas\/nueva"/);
  assert.doesNotMatch(home, /TrackChain|trackchain|chain\.io/i);
  const header = read("src/components/Header.tsx");
  assert.match(header, /mobile-cta/);
});

test("franja superior y FreeBanner no hablan de precios ni comisiones", () => {
  const header = read("src/components/Header.tsx");
  assert.match(header, /Costo de referencia desglosado del flete/);
  // Solo el JSX visible del banner superior (no comentarios de código).
  const headerBanner = header.match(/demo-banner[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(headerBanner, /Costo de referencia desglosado del flete/);
  assert.doesNotMatch(headerBanner, /\$\d|CLP\s*\d|comisi[oó]n|membres[ií]a|precio de lista/i);
  const banner = read("src/components/FreeBanner.tsx");
  assert.match(banner, /Costo de referencia desglosado del flete/);
  const visible = banner.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(visible, /\$\d|CLP\s*\d|comisi[oó]n|%\s*fee/i);
});

test("portada visual: cookie compacta y dos CTA de perfil con el mismo peso", () => {
  const banner = read("src/components/CookieConsentBanner.tsx");
  assert.match(banner, /cookie-banner-compact/);
  assert.match(banner, /Solo necesarias/);
  assert.match(banner, /Aceptar/);
  const home = read("src/app/page.tsx");
  const hero = home.match(/hero-fold[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(hero, /className="btn"[^>]*>\s*Tengo carga/);
  assert.match(hero, /className="btn"[^>]*>\s*Tengo camión o retorno/);
  assert.doesNotMatch(hero, /className="btn"[^>]*>\s*Soy transportista/);
  const secondary = hero.match(/hero-secondary-links[\s\S]*?<\/p>/)?.[0] || "";
  assert.match(secondary, /Abrir el cotizador/);
  assert.doesNotMatch(secondary, /Tengo camión/);
  assert.doesNotMatch(secondary, /className="btn"/);
  const css = read("src/app/orbita.module.css");
  assert.match(css, /\.surface :global\(section\.block h2\)/);
  assert.match(css, /color:#f5f5f5/);
  assert.match(home, /PortalPanels/);
  assert.doesNotMatch(home, /home-bw|AnalyticsConsent|<AgentCard/);
});

test("las maquetas Órbita viven en docs y Next no las publica", () => {
  for (const rel of ["v1/index.html", "v2/index.html", "v3/index.html", "SESSION.md", "README-original.md"]) {
    assert.equal(fs.existsSync(path.join(ROOT, "docs/design/orbita", rel)), true, rel);
  }
  assert.equal(fs.existsSync(path.join(ROOT, "src/app/docs")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "public/design/orbita")), false);
  const config = read("next.config.ts");
  assert.doesNotMatch(config, /docs\/design\/orbita/);
  const session = read("docs/design/orbita/SESSION.md");
  assert.doesNotMatch(session, /contacto@carga360go\.cl/);
  assert.doesNotMatch(session, /-----BEGIN|ssh-rsa|AKIA/);
});
