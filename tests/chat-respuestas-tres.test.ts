import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { detectIntent, ruleReply, type Intent } from "../src/lib/whatsapp/intents";

const live = { activeLoads: 2, activeTrucks: 1, recentLoads: ["Santiago → Antofagasta"], recentTrucks: [] };

const PRECIO = ruleReply("precio", live, "web");
const PUBLICAR = ruleReply("publicar_carga", live, "web");
const HUMANO = ruleReply("humano", live, "web");

function assertNoProtectedContacts(text: string) {
  assert.doesNotMatch(text, /\+56\s*9/);
  assert.doesNotMatch(text, /wa\.me\//i);
  assert.doesNotMatch(text, /@(?!carga360go\.cl)\w/);
  assert.doesNotMatch(text, /\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/);
}

test("buscar cargas: variantes de transportista y listado, sin contactos protegidos", () => {
  const phrases = [
    "Soy transportista y busco cargas",
    "busco carga",
    "cargas disponibles",
    "ver cargas",
    "buscar carga para mi camión",
  ];
  for (const phrase of phrases) {
    assert.equal(detectIntent(phrase), "buscar_carga", phrase);
  }
  for (const channel of ["web", "whatsapp"] as const) {
    const reply = ruleReply("buscar_carga", live, channel);
    assert.match(reply, /https:\/\/carga360go\.cl\/cargas/);
    assert.match(reply, /publicaciones|consultar/i);
    assert.match(reply, /requisitos/i);
    assert.match(reply, /ofertar/i);
    assertNoProtectedContacts(reply);
  }
  // "Soy transportista" solo sigue siendo registro, no buscar.
  assert.equal(detectIntent("Soy transportista"), "registro_transportista");
});

test("documentos rechazados: panel + soporte, sin inventar ni pedir identidad por chat", () => {
  const phrases = [
    "¿Por qué rechazaron mis documentos?",
    "me rechazaron los documentos",
    "documentos rechazados con observación",
    "por que no me aprobaron los papeles",
  ];
  for (const phrase of phrases) {
    assert.equal(detectIntent(phrase), "documentos_rechazo", phrase);
  }
  // Pregunta genérica de requisitos sigue en documentos.
  assert.equal(detectIntent("qué documentos piden"), "documentos");
  for (const channel of ["web", "whatsapp"] as const) {
    const reply = ruleReply("documentos_rechazo", live, channel);
    assert.match(reply, /panel|iniciar sesi[oó]n|ingreso/i);
    assert.match(reply, /observaci[oó]n/i);
    assert.match(reply, /contacto@carga360go\.cl/);
    assert.match(reply, /no inventamos|no pedimos/i);
    assert.doesNotMatch(reply, /env[ií]e (su )?c[eé]dula|mande (su )?rut|adjunte (el )?documento/i);
  }
});

test("seguimiento / ubicación de carga: sin GPS ni estados inventados", () => {
  const phrases = [
    "¿Dónde está mi carga?",
    "quiero el seguimiento de mi carga",
    "ubicación de mi carga",
    "tienen GPS de mi carga",
  ];
  for (const phrase of phrases) {
    assert.equal(detectIntent(phrase), "seguimiento_carga", phrase);
  }
  for (const channel of ["web", "whatsapp"] as const) {
    const reply = ruleReply("seguimiento_carga", live, channel);
    assert.match(reply, /no consulta|tiempo real|no ofrecemos GPS/i);
    assert.match(reply, /panel|ingreso/i);
    assert.match(reply, /contacto@carga360go\.cl/);
    assert.doesNotMatch(reply, /est[aá] en ruta|lleg[oó] a destino|coordenadas/i);
  }
});

test("las tres respuestas no pisan publicar, precio ni humano", () => {
  assert.equal(detectIntent("¿Cuánto cuesta publicar?"), "precio");
  assert.equal(detectIntent("Quiero hablar con una persona"), "humano");
  assert.equal(detectIntent("Soy empresa con carga"), "publicar_carga");
  assert.equal(detectIntent("¿Cómo publico una carga?"), "publicar_carga");

  assert.equal(ruleReply("precio", live, "web"), PRECIO);
  assert.equal(ruleReply("publicar_carga", live, "web"), PUBLICAR);
  assert.equal(ruleReply("humano", live, "web"), HUMANO);
  assert.equal(ruleReply("precio", live, "whatsapp"), ruleReply("precio", live, "whatsapp"));
  assert.match(PUBLICAR, /cargas\/nueva/);
  assert.match(PRECIO, /peajes|di[eé]sel|costo real del flete/i);
  assert.doesNotMatch(PRECIO, /comisi[oó]n|membres[ií]a|30 d[ií]as gratis/i);
  assert.match(HUMANO, /contacto@carga360go\.cl/);

  const touched: Intent[] = ["buscar_carga", "documentos_rechazo", "seguimiento_carga"];
  for (const intent of touched) {
    const text = ruleReply(intent, live, "web");
    assert.notEqual(text, PUBLICAR);
    assert.notEqual(text, PRECIO);
    assert.notEqual(text, HUMANO);
  }
});
