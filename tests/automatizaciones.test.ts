import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { automationsNotifyEnabled } from "../src/lib/automations/config";
import { notifyLoadSuggestions } from "../src/lib/automations/notify";
import { listLoadSuggestions, suggestForLoad, type SuggestLoad, type SuggestTruck } from "../src/lib/automations/suggest";
import { registerUser } from "../src/lib/auth";
import { MIGRATION_33_SQL, MIGRATION_33_TABLES, getDb } from "../src/lib/db";
import { rutDv, todayChile } from "../src/lib/format";
import { createLoad, createTruck } from "../src/lib/listings";
import { mailOutboxDir } from "../src/lib/mail";
import type { PublicUser } from "../src/lib/types";

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

let seq = 0;
function account(role: "transportista" | "mandante", name: string): PublicUser {
  seq += 1;
  const body = String(17_000_000 + seq * 7919);
  const rut = `${body}-${rutDv(body)}`;
  return registerUser({
    role,
    razonSocial: name,
    rut,
    contactName: name,
    email: `${name.toLowerCase().replace(/\s+/g, "")}@automatizacion.test`,
    password: "clave-segura-1",
    whatsapp: `+56 9 ${String(41000000 + seq).slice(0, 4)} ${String(41000000 + seq).slice(4)}`,
    city: "Santiago",
  }).user;
}

const today = todayChile();

function baseLoad(over: Partial<SuggestLoad> = {}): SuggestLoad {
  return {
    id: "carga",
    ownerId: "mandante",
    isDemo: false,
    equipment: "rampla_plana",
    weightT: 20,
    origin: "Santiago",
    destination: "Concepción",
    pickupDate: addDays(today, 1),
    specs: {},
    ...over,
  };
}

function baseTruck(over: Partial<SuggestTruck> = {}): SuggestTruck {
  return {
    id: "camion",
    ownerId: "carrier",
    isDemo: false,
    ownerVerification: "verificado",
    equipment: "rampla_plana",
    tonnage: 28,
    origin: "Santiago",
    destination: "Concepción",
    availableFrom: today,
    availableTo: addDays(today, 8),
    specs: {},
    ...over,
  };
}

test("la migración 33 existe y el aviso nace apagado", () => {
  assert.equal(automationsNotifyEnabled(), false);
  for (const table of MIGRATION_33_TABLES) {
    assert.equal(Boolean(getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table)), true, table);
  }
  const file = fs.readFileSync(path.join(process.cwd(), "docs/migrations/033-sugerencias-carga.sql"), "utf8");
  assert.match(file, /CREATE TABLE IF NOT EXISTS load_suggestions/);
  getDb().exec(file);
  getDb().exec(MIGRATION_33_SQL);
});

test("sugiere compatible en la misma ruta y retorno en el corredor inverso", () => {
  const same = suggestForLoad(baseLoad(), [baseTruck()]);
  assert.equal(same.length, 1);
  assert.equal(same[0].kind, "compatible");
  const back = suggestForLoad(baseLoad({ origin: "Punta Arenas", destination: "Arica" }), [
    baseTruck({ origin: "Arica", destination: "Punta Arenas" }),
  ]);
  assert.equal(back.length, 1);
  assert.equal(back[0].kind, "retorno");
  assert.match(back[0].reasons.join(" "), /retorno/i);
  assert.doesNotMatch(back[0].reasons.join(" "), /\$\s?\d|30 días gratis/);
  const none = suggestForLoad(baseLoad(), [baseTruck({ ownerId: "mandante" }), baseTruck({ id: "otro", equipment: "tolva" })]);
  assert.deepEqual(none, []);
});

test("publicar una carga guarda la sugerencia y, con el aviso apagado, no escribe correo", async () => {
  const mandante = account("mandante", "Mandante Auto");
  const carrier = account("transportista", "Secreto Transportista");
  createTruck(carrier, {
    origin: "Santiago",
    destination: "Concepción",
    availableFrom: today,
    availableTo: addDays(today, 8),
    equipment: "rampla_plana",
    tonnage: 28,
    specs: {},
  });
  const before = fs.existsSync(mailOutboxDir()) ? fs.readdirSync(mailOutboxDir()) : [];
  const load = createLoad(mandante, {
    origin: "Santiago",
    destination: "Concepción",
    pickupDate: addDays(today, 1),
    equipment: "rampla_plana",
    description: "Pallets",
    weightT: 20,
    specs: {},
  });
  await new Promise((resolve) => setImmediate(resolve));
  const rows = listLoadSuggestions(load.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "compatible");
  const after = fs.existsSync(mailOutboxDir()) ? fs.readdirSync(mailOutboxDir()) : [];
  assert.deepEqual(after, before);
  const skipped = await notifyLoadSuggestions(load.id, {
    fetchImpl: async () => {
      throw new Error("webhook no debe llamarse");
    },
  });
  assert.equal(skipped, "omitido");
});

test("con el aviso encendido el correo no lleva contacto del transportista ni precio", async () => {
  const mandante = account("mandante", "Mandante Aviso");
  const carrier = account("transportista", "Flota Norte");
  createTruck(carrier, {
    origin: "Arica",
    destination: "Punta Arenas",
    availableFrom: today,
    availableTo: addDays(today, 15),
    equipment: "rampla_plana",
    tonnage: 30,
    specs: {},
  });
  const load = createLoad(mandante, {
    origin: "Punta Arenas",
    destination: "Arica",
    pickupDate: addDays(today, 3),
    equipment: "rampla_plana",
    description: "Retorno",
    weightT: 16,
    specs: {},
  });
  assert.equal(listLoadSuggestions(load.id)[0]?.kind, "retorno");
  process.env.AUTOMATIONS_NOTIFY_ENABLED = "true";
  process.env.AUTOMATIONS_WEBHOOK_URL = "https://hooks.example.test/carga360";
  let webhook = "";
  try {
    const result = await notifyLoadSuggestions(load.id, {
      fetchImpl: async (_url, init) => {
        webhook = String(init?.body ?? "");
        return new Response("ok");
      },
    });
    assert.equal(result, "enviado");
    const files = fs.readdirSync(mailOutboxDir()).filter((name) => name.endsWith(".txt"));
    const hit = files.map((name) => fs.readFileSync(path.join(mailOutboxDir(), name), "utf8")).find((text) => text.includes(load.id));
    assert.ok(hit, "hay correo de la carga");
    assert.ok(hit.includes(mandante.email));
    assert.match(hit, /\[sin datos\]/);
    assert.equal(hit.includes(carrier.email), false);
    assert.equal(hit.includes(carrier.whatsapp.replace(/\D/g, "")), false);
    assert.doesNotMatch(hit, /\$\s?\d|30 días gratis/);
    assert.match(webhook, /carga\.sugerencias/);
    assert.equal(webhook.includes(carrier.email), false);
    const second = await notifyLoadSuggestions(load.id);
    assert.equal(second, "omitido");
  } finally {
    process.env.AUTOMATIONS_NOTIFY_ENABLED = "false";
    delete process.env.AUTOMATIONS_WEBHOOK_URL;
  }
});

