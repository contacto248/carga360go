import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { registerUser, setUserVerification } from "../src/lib/auth";
import { todayChile, rutDv } from "../src/lib/format";
import { createLoad, createTruck, listLoads } from "../src/lib/listings";
import { isPilotCorridorFilter, nearbyLoads, nearbyTrucks } from "../src/lib/nearby";
import { LANDING_SLUGS, landingBySlug, SEO_LANDINGS } from "../src/lib/seo-landings";
import { MATCH_DISCLAIMER, MATCH_NAME } from "../src/lib/match-copy";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import type { PublicUser } from "../src/lib/types";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

let seq = 0;
function account(role: "transportista" | "mandante", name: string, city = "Santiago"): PublicUser {
  seq += 1;
  const body = String(16_000_000 + seq * 7919);
  const rut = `${body}-${rutDv(body)}`;
  return registerUser({
    role,
    razonSocial: name,
    rut,
    contactName: name,
    email: `${name.toLowerCase().replace(/\s+/g, "")}@mejoras.test`,
    password: "clave-segura-1",
    whatsapp: `+56 9 ${String(40000000 + seq).slice(0, 4)} ${String(40000000 + seq).slice(4)}`,
    city,
  }).user;
}

test("la portada usa el copy del paquete y no promete acreditación 100% ni auditorías de calidad", () => {
  const home = `${read("src/app/page.tsx")}\n${read("src/components/HomeShowcase.tsx")}`;
  assert.match(home, /La plataforma para gestionar el transporte de carga en Chile/);
  assert.match(home, /Publica tu carga/);
  assert.match(home, /Soy transportista/);
  assert.match(home, /href="\/cargas\/nueva"/);
  assert.match(home, /href="\/registro"/);
  assert.match(home, /Operamos en diferentes industrias/);
  assert.match(home, /Trazabilidad en tiempo real/);
  assert.match(home, /Transportistas validados/);
  assert.match(home, /Menos viajes vacíos/);
  assert.match(home, /Sostenible/);
  assert.doesNotMatch(home, /\d+\s*(t|ton|kg)\s*de\s*CO/i);
  assert.match(home, /IA que asiste la coordinación/);
  assert.match(home, /Documentos validados/);
  assert.match(home, /En tránsito · Antofagasta → Santiago/);
  assert.doesNotMatch(home, /Carga Retorno 360/);
  assert.doesNotMatch(home, /271\s*K/);
  assert.match(home, /Carga360go conecta a las partes/);
  assert.match(home, /\/como-verificamos/);
  assert.match(home, /\/transporte-minero-chile/);
  assert.match(home, /Carga360 Match/);
  assert.doesNotMatch(home, /100% acreditad/);
  assert.doesNotMatch(home, /calidad, seguridad y medio ambiente/);
  assert.doesNotMatch(home, /La bolsa de carga de Chile que/);
  // Modo arranque: no se pinta el panel de 16 regiones si casi todas van en cero.
  assert.match(home, /showRegionPanel = activeRegions >= 3/);
  assert.match(home, /if \(stats\.activeLoads > 0\)/);
  assert.doesNotMatch(home, /testimonios/i);
});

test("las seis landings SEO y Cómo verificamos existen con metas propias, sin cifras inventadas", () => {
  assert.equal(SEO_LANDINGS.length, 6);
  assert.deepEqual(LANDING_SLUGS, [
    "/transporte-minero-chile",
    "/cama-baja-y-maquinaria",
    "/cargas-de-retorno-mineras",
    "/transporte-calama",
    "/transporte-antofagasta",
    "/transporte-copiapo",
  ]);
  for (const landing of SEO_LANDINGS) {
    const page = path.join(ROOT, "src/app", landing.slug.slice(1), "page.tsx");
    assert.ok(fs.existsSync(page), landing.slug);
    const found = landingBySlug(landing.slug);
    assert.equal(found?.h1, landing.h1);
    const blob = landing.body.join(" ");
    assert.doesNotMatch(blob, /\b\d{2,}\s*%/);
    assert.doesNotMatch(blob, /testimonio/i);
    assert.doesNotMatch(landing.meta, /miles de|número 1|líder del mercado/i);
  }
  const verify = read("src/app/como-verificamos/page.tsx");
  assert.match(verify, /Cómo verificamos cuentas y documentos/);
  assert.match(verify, /cédula de\s+identidad/);
  assert.match(verify, /licencia de conducir profesional/);
  assert.match(verify, /padrón/);
  assert.match(verify, /revisión técnica/);
  assert.match(verify, /SOAP/);
  assert.match(verify, /permiso de circulación/);
  assert.match(verify, /No es un sello de solvencia/);
  assert.match(verify, /no validamos en línea/);
});

test("el sitemap lista landings y cómo verificamos, y ya no indexa filtros ?regionOrigen=", () => {
  const entries = sitemap();
  const urls = entries.map((item) => item.url);
  assert.ok(urls.includes("https://www.carga360go.cl/como-verificamos"));
  for (const slug of LANDING_SLUGS) {
    assert.ok(urls.includes(`https://www.carga360go.cl${slug}`), slug);
  }
  assert.equal(urls.some((url) => url.includes("?regionOrigen=")), false);
  const bot = robots();
  assert.equal(bot.sitemap, "https://www.carga360go.cl/sitemap.xml");
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /GOOGLE_SITE_VERIFICATION/);
  assert.match(layout, /verification: \{ google:/);
});

test("el estado vacío y las alertas piden consentimiento; el corredor piloto se detecta", () => {
  const empty = read("src/components/EmptyState.tsx");
  assert.match(empty, /No hay avisos con esos filtros por ahora/);
  assert.match(empty, /PILOT_EMPTY_MESSAGE/);
  const alerts = read("src/components/Alerts.tsx");
  assert.match(alerts, /Acepto recibir alertas de avisos compatibles; puedo pausarlas cuando quiera/);
  assert.equal(isPilotCorridorFilter({ regionOrigen: "antofagasta" }), true);
  assert.equal(isPilotCorridorFilter({ origen: "Calama", destino: "Copiapó" }), true);
  assert.equal(isPilotCorridorFilter({ regionOrigen: "metropolitana" }), false);
  assert.equal(isPilotCorridorFilter({ origen: "Santiago" }), false);
});

test("avisos cercanos solo aparecen si existen de verdad y no inventan resultados", () => {
  const today = todayChile();
  const mandante = account("mandante", "Mandante Cercano");
  const transportista = account("transportista", "Transportes Cercano", "Calama");
  setUserVerification(transportista.id, "verificado", null);
  const load = createLoad(mandante, {
    origin: "Calama",
    destination: "Antofagasta",
    pickupDate: addDays(today, 2),
    equipment: "rampla_plana",
    description: "Carga real de prueba",
    weightT: 15,
    specs: {},
  });
  const exact = listLoads({ origen: "Copiapó", destino: "Antofagasta" });
  assert.equal(exact.length, 0);
  const nearby = nearbyLoads({ origen: "Copiapó", destino: "Antofagasta", equipo: "rampla_plana" }, []);
  assert.ok(nearby.some((hit) => hit.item.id === load.id));
  assert.match(nearby[0].why, /región|Fecha|equipo/i);
  const empty = nearbyLoads({ origen: "Punta Arenas", destino: "Puerto Natales" }, []);
  assert.equal(empty.length, 0);
  createTruck(transportista, {
    origin: "Calama",
    destination: "Antofagasta",
    availableFrom: today,
    availableTo: addDays(today, 6),
    equipment: "rampla_plana",
    tonnage: 28,
    specs: {},
  });
  const nearbyTruck = nearbyTrucks({ regionOrigen: "antofagasta", equipo: "cama_baja" }, []);
  assert.ok(nearbyTruck.length >= 1);
  assert.match(nearbyTruck[0].why, /región|equipo/i);
});

test("Carga360 Match se nombra junto al porcentaje, sin rehacer el motor", () => {
  assert.equal(MATCH_NAME, "Carga360 Match");
  assert.match(MATCH_DISCLAIMER, /No es una garantía de contratación/);
  const cards = read("src/components/Cards.tsx");
  assert.match(cards, /MATCH_DISCLAIMER/);
  assert.match(cards, /MATCH_NAME/);
});

test("no se modificaron los textos legales de privacidad ni términos en este paquete", () => {
  const privacy = read("src/lib/privacy-policy.ts");
  const terms = read("src/lib/terms.ts");
  assert.match(privacy, /requisitos de calidad, seguridad y medio ambiente/);
  assert.match(terms, /cuentas 100% acreditadas/);
  // La suavización pública está en la portada y en /como-verificamos, no en estos archivos.
  const home = `${read("src/app/page.tsx")}\n${read("src/components/HomeShowcase.tsx")}`;
  assert.doesNotMatch(home, /100% acreditad/);
});
