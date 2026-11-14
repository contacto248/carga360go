import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  MAX_ALERTS_PER_DAY,
  alertForNewLoad,
  alertForNewTruck,
  alertsEnabled,
  listSavedSearches,
  saveSearch,
  setAlertsEnabled,
  unsubscribeByToken,
  unsubscribeToken,
} from "../src/lib/alerts";
import { registerUser, setUserVerification } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { rutDv, todayChile } from "../src/lib/format";
import { roadKm } from "../src/lib/geo";
import { createLoad, createTruck, listLoads } from "../src/lib/listings";
import { mailOutboxDir } from "../src/lib/mail";
import { estimateByKm, estimatePrice } from "../src/lib/pricing";
import { liveStats, recentListings, regionActivity, regionIndicators } from "../src/lib/stats";
import { REGION_SHAPES } from "../src/lib/chile-map-data";
import { REGIONS } from "../src/lib/catalog";
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
  const body = String(15_000_000 + seq * 7919);
  const rut = `${body}-${rutDv(body)}`;
  return registerUser({
    role,
    razonSocial: name,
    rut,
    contactName: name,
    email: `${name.toLowerCase().replace(/\s+/g, "")}@redesign.test`,
    password: "clave-segura-1",
    whatsapp: `+56 9 ${String(30000000 + seq).slice(0, 4)} ${String(30000000 + seq).slice(4)}`,
    city: "Santiago",
  }).user;
}

const today = todayChile();

function truckFor(user: PublicUser, origin = "Santiago", destination = "Concepción") {
  return createTruck(user, {
    origin,
    destination,
    availableFrom: today,
    availableTo: addDays(today, 6),
    equipment: "rampla_plana",
    tonnage: 28,
    specs: {},
  });
}

function loadFor(user: PublicUser, extra: Partial<Parameters<typeof createLoad>[1]> = {}) {
  return createLoad(user, {
    origin: "Santiago",
    destination: "Concepción",
    pickupDate: addDays(today, 1),
    equipment: "rampla_plana",
    description: "Pallets de abarrotes",
    weightT: 20,
    specs: {},
    ...extra,
  });
}

function outbox(): string {
  const dir = mailOutboxDir();
  if (!fs.existsSync(dir)) return "";
  return fs
    .readdirSync(dir)
    .map((file) => fs.readFileSync(`${dir}/${file}`, "utf8"))
    .join("\n----\n");
}

test("distancia vial estimada entre ciudades", () => {
  const scl = roadKm("Santiago", "Concepción")!;
  assert.ok(scl >= 450 && scl <= 650, `Santiago–Concepción ${scl}`);
  const antof = roadKm("Santiago", "Antofagasta")!;
  assert.ok(antof >= 1200 && antof <= 1500, `Santiago–Antofagasta ${antof}`);
  assert.ok(roadKm("Arica", "Punta Arenas")! > 4000);
  assert.equal(roadKm("Santiago", "Santiago"), 0);
  assert.equal(roadKm("Santiago", "Narnia"), null);
});

test("precio sugerido referencial por km y equipo", () => {
  const general = estimateByKm(1000, "rampla_plana")!;
  assert.equal(general.min, 900_000);
  assert.equal(general.max, 1_500_000);
  const special = estimateByKm(1000, "cama_baja")!;
  assert.ok(special.min > general.max - 1, "la cama baja es más cara que la carga general");
  const short = estimateByKm(20, "rampla_plana")!;
  assert.equal(short.min, 120_000, "aplica mínimo por viaje");
  assert.ok(short.max > short.min);
  assert.equal(estimatePrice("Santiago", "Santiago", "rampla_plana"), null);
  process.env.PRICE_RATES_JSON = JSON.stringify({ rampla_plana: [1000, 2000], sider: "malo" });
  assert.equal(estimateByKm(1000, "rampla_plana")!.max, 2_000_000);
  assert.equal(estimateByKm(1000, "sider")!.min, 900_000);
  delete process.env.PRICE_RATES_JSON;
});

test("match automático: alerta por correo a transportistas compatibles, con límite y baja", async () => {
  const mandante = account("mandante", "Mandante Alfa");
  const verified = account("transportista", "Transportes Norte");
  setUserVerification(verified.id, "verificado", null);
  const locked = account("transportista", "Transportes Pendiente");
  const far = account("transportista", "Transportes Sur");
  setUserVerification(far.id, "verificado", null);

  const okTruck = truckFor(verified);
  truckFor(locked);
  truckFor(far, "Punta Arenas", "Puerto Natales");

  const load = loadFor(mandante);
  const outcomes = await alertForNewLoad(load.id);
  assert.equal(outcomes.length, 1, "solo el transportista validado y compatible recibe aviso");
  assert.equal(outcomes[0].userId, verified.id);
  assert.equal(outcomes[0].status, "enviado");
  assert.equal(outcomes[0].delivery, "no_configurado");
  const mail = outbox();
  assert.match(mail, /Nueva carga que calza: Santiago → Concepción/);
  assert.match(mail, /\/alertas\/baja\?t=/);
  assert.match(mail, new RegExp(`/cargas/${load.id}`));

  // Sin duplicados para la misma publicación.
  const again = await alertForNewLoad(load.id);
  assert.equal(again[0].status, "duplicado");

  // La carga aparece en el listado con el camión compatible.
  const listed = listLoads({ regionOrigen: "metropolitana" }).find((item) => item.id === load.id)!;
  assert.ok(listed.matches.some((match) => match.truck.id === okTruck.id));

  // Límite diario.
  const db = getDb();
  for (let i = 0; i < MAX_ALERTS_PER_DAY; i += 1) {
    db.prepare(`INSERT INTO alert_log (id, user_id, listing_kind, listing_id, reason, delivery, sent_at) VALUES (?, ?, 'carga', ?, 'test', 'smtp', ?)`).run(
      `fill-${i}`,
      verified.id,
      `fake-${i}`,
      new Date().toISOString(),
    );
  }
  const limited = await alertForNewLoad(loadFor(mandante, { description: "Fierro" }).id);
  assert.equal(limited[0].status, "limite");
  db.prepare(`DELETE FROM alert_log WHERE id LIKE 'fill-%'`).run();

  // Baja con el enlace del correo.
  const token = unsubscribeToken(verified.id);
  assert.equal(unsubscribeToken(verified.id), token, "el token es estable");
  assert.equal(unsubscribeByToken("token-inexistente-123456789"), false);
  assert.equal(unsubscribeByToken(token), true);
  assert.equal(alertsEnabled(verified.id), false);
  assert.equal((await alertForNewLoad(loadFor(mandante, { description: "Cemento" }).id)).length, 0);
  setAlertsEnabled(verified.id, true);
  assert.equal((await alertForNewLoad(loadFor(mandante, { description: "Madera" }).id))[0].status, "enviado");
});

test("camión nuevo avisa al mandante con carga compatible y a búsquedas guardadas", async () => {
  const owner = account("mandante", "Mandante Beta");
  const watcher = account("mandante", "Mandante Gama");
  const carrier = account("transportista", "Transportes Centro");
  setUserVerification(carrier.id, "verificado", null);
  loadFor(owner, { origin: "Rancagua", destination: "Talca" });

  assert.throws(() => saveSearch(watcher, "camiones", {}), AppError);
  const saved = saveSearch(watcher, "camiones", { regionOrigen: "ohiggins", equipo: "rampla_plana", basura: "x" });
  assert.deepEqual(saved.filters, { regionOrigen: "ohiggins", equipo: "rampla_plana" });
  assert.throws(() => saveSearch(watcher, "camiones", { regionOrigen: "ohiggins", equipo: "rampla_plana" }), AppError);
  assert.equal(listSavedSearches(watcher.id).length, 1);

  const truck = truckFor(carrier, "Rancagua", "Talca");
  const outcomes = await alertForNewTruck(truck.id);
  const users = outcomes.map((item) => item.userId).sort();
  assert.deepEqual(users, [owner.id, watcher.id].sort());
  assert.ok(outcomes.every((item) => item.status === "enviado"));
});

test("estadísticas en vivo solo cuentan publicaciones reales", () => {
  const stats = liveStats();
  assert.ok(stats.activeLoads >= 1);
  assert.ok(stats.activeTrucks >= 1);
  assert.ok(stats.verifiedCarriers >= 2);
  const regions = regionActivity();
  assert.equal(regions.length, 16);
  assert.ok(regions.find((region) => region.id === "metropolitana")!.total > 0);
  assert.equal(regions.find((region) => region.id === "aysen")!.total, 0);
  assert.ok(recentListings(3).length <= 3);
});

test("panel de regiones: 16 regiones norte a sur con indicadores reales y forma en el mapa", () => {
  const rows = regionIndicators();
  assert.deepEqual(rows.map((row) => row.id), REGIONS.map((region) => region.id));
  assert.equal(rows[0].id, "arica-y-parinacota");
  assert.equal(rows[15].id, "magallanes");
  const rm = rows.find((row) => row.id === "metropolitana")!;
  assert.ok(rm.loadsFrom >= 1 && rm.trucks >= 1 && rm.verifiedCarriers >= 1);
  assert.equal(rm.activity, rm.loadsFrom + rm.trucks);
  const biobio = rows.find((row) => row.id === "biobio")!;
  assert.ok(biobio.loadsTo >= 1);
  const aysen = rows.find((row) => row.id === "aysen")!;
  assert.equal(aysen.activity + aysen.loadsTo, 0);
  const stats = liveStats();
  assert.equal(rows.reduce((sum, row) => sum + row.loadsFrom, 0) <= stats.activeLoads, true);
  for (const region of REGIONS) assert.ok(REGION_SHAPES[region.id]?.d.startsWith("M"), region.id);
});

test("filtro de equipos acepta varios tipos a la vez", () => {
  const all = listLoads({});
  assert.ok(all.length > 0);
  assert.equal(listLoads({ equipo: "rampla_plana" }).length, all.filter((l) => l.equipment === "rampla_plana").length);
  assert.equal(listLoads({ equipo: "sider,rampla_plana" }).length, listLoads({ equipo: "rampla_plana" }).length + listLoads({ equipo: "sider" }).length);
  assert.equal(listLoads({ equipo: "sider" }).length, 0);
  assert.equal(listLoads({ equipo: "sider,," }).length, 0);
});
