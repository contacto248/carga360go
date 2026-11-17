import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { getDb } from "../src/lib/db";
import { lastDiesel, parseEnapDieselPrice } from "../src/lib/costos/diesel";
import { encodePolyline } from "../src/lib/costos/geometry";
import { chooseProvider, parseGoogleDirectionsBody, parseGoogleRoutesBody } from "../src/lib/costos/routing";
import { DEFAULT_VIATICO_CLP, JORNADA_CAMION_KM, ROUTE_COST_NOTICE, computeRouteCost, routeCostLines, travelDays } from "../src/lib/costos/ruta-costo";
import { detectTolls } from "../src/lib/costos/tolls";
import { TOLL_PLAZAS, TOLL_SOURCES } from "../src/lib/costos/tolls-data";
import { VEHICLE_CLASSES } from "../src/lib/costos/vehicles";

const NOW = new Date("2026-11-17T15:00:00.000Z");

test("jornada de camión: días según los kilómetros", () => {
  assert.equal(JORNADA_CAMION_KM, 500);
  assert.equal(travelDays(0), 1);
  assert.equal(travelDays(500), 1);
  assert.equal(travelDays(500.1), 2);
  assert.equal(travelDays(1000), 2);
  assert.equal(travelDays(1365), 3);
});

test("desglose: diésel, peajes, viático y total", () => {
  const cost = computeRouteCost({ km: 1365, kmPerL: 2.6, dieselPrice: 1675.8, tollsClp: 100_000, viaticoDia: DEFAULT_VIATICO_CLP });
  assert.equal(DEFAULT_VIATICO_CLP, 20_000);
  assert.equal(cost.days, 3);
  assert.equal(cost.liters, 1365 / 2.6);
  assert.equal(cost.dieselClp, Math.round((1365 / 2.6) * 1675.8));
  assert.equal(cost.tollsClp, 100_000);
  assert.equal(cost.viaticoClp, 60_000);
  assert.equal(cost.total, cost.dieselClp! + 100_000 + 60_000);
  const lines = routeCostLines(cost);
  assert.equal(lines.diesel, String(cost.dieselClp));
  assert.equal(lines.peajes, "100000");
  assert.equal(lines.viatico, "60000");
  assert.equal(lines.total, String(cost.total));
  assert.equal(lines.total.includes("Total pendiente"), false);
  assert.equal(ROUTE_COST_NOTICE, "Valor estimativo de referencia; el valor final lo acuerdan las partes.");
});

test("modo manual: cambian km, peajes, diésel, rendimiento y viático", () => {
  const cost = computeRouteCost({ km: 800, kmPerL: 3, dieselPrice: 1500, tollsClp: 12_000, viaticoDia: 25_000 });
  assert.equal(cost.days, 2);
  assert.equal(cost.dieselClp, Math.round((800 / 3) * 1500));
  assert.equal(cost.viaticoClp, 50_000);
  assert.equal(cost.total, cost.dieselClp! + 12_000 + 50_000);
});

test("sin precio de diésel el total queda pendiente", () => {
  const cost = computeRouteCost({ km: 1365, kmPerL: 2.6, dieselPrice: null, tollsClp: 100_000, viaticoDia: 20_000 });
  assert.equal(cost.dieselClp, null);
  assert.equal(cost.total, null);
  assert.equal(routeCostLines(cost).total, "Total pendiente");
});

test("diésel: si la fuente falla se usa el último valor guardado y no aparece Total pendiente", () => {
  const zone = "Zona Norte";
  const fetched = "2099-01-02T08:00:00.000Z";
  getDb()
    .prepare(`INSERT INTO cost_diesel_prices (id, source_id, zone, price, price_min, price_max, unit, fetched_at) VALUES (?, 'bencina_en_linea_zonal', ?, 1675.77, NULL, NULL, '$/L', ?)`)
    .run(`ruta-costo-${zone}`, zone, fetched);
  const stored = lastDiesel(zone, NOW);
  assert.equal(stored.price, 1675.77);
  assert.equal(stored.fetchedAt?.slice(0, 10), "2099-01-02");
  assert.match(stored.warning ?? "", /2099-01-02/);
  const cost = computeRouteCost({ km: 1000, kmPerL: 2.6, dieselPrice: stored.price, tollsClp: 50_000, viaticoDia: DEFAULT_VIATICO_CLP });
  const lines = routeCostLines(cost);
  assert.notEqual(lines.total, "Total pendiente");
  assert.equal(lines.total.includes("Total pendiente"), false);
  assert.ok(cost.total! > 0);
});

test("ENAP: una variación semanal no es un precio; un valor absoluto sí", () => {
  assert.equal(parseEnapDieselPrice("La variación estimada es de +41,9 $/lt en el precio del diésel."), null);
  assert.equal(parseEnapDieselPrice("El precio del diésel al consumidor es $1.520 por litro."), 1520);
});

test("peajes verificados: Ruta 68 y Angostura, con fuente y vigencia; Ruta 1 no se inventa", () => {
  const source68 = TOLL_SOURCES.find((source) => source.id === "mop_ruta_68")!;
  assert.match(source68.url, /RUTA-68\.pdf$/);
  assert.equal(source68.validFrom, "2026-01-01");
  assert.equal(source68.validTo, "2026-12-31");
  const lo = TOLL_PLAZAS.find((plaza) => plaza.id === "r68_lo_prado")!;
  assert.deepEqual(
    lo.rates.filter((rate) => rate.category === "camion_2_ejes").map((rate) => rate.amount).sort((a, b) => a - b),
    [4800, 7200],
  );
  assert.deepEqual(
    lo.rates.filter((rate) => rate.category === "camion_mas_2_ejes").map((rate) => rate.amount).sort((a, b) => a - b),
    [8600, 12900],
  );
  const sur = TOLL_PLAZAS.find((plaza) => plaza.id === "r68_troncal_sur")!;
  assert.equal(sur.rates.find((rate) => rate.category === "camion_mas_2_ejes")?.amount, 3500);
  const angostura = TOLL_PLAZAS.find((plaza) => plaza.id === "r5s_angostura")!;
  assert.equal(angostura.route, "Ruta 5 Sur");
  assert.equal(angostura.rates.find((rate) => rate.category === "camion_2_ejes")?.amount, 6900);
  assert.equal(TOLL_PLAZAS.some((plaza) => /ruta\s*1/i.test(plaza.route)), false);

  const line = {
    geometry: [
      [-70.8985265, -33.5],
      [-70.8985265, -33.4568855],
      [-70.8985265, -33.4],
    ] as [number, number][],
  };
  const two = detectTolls(line, VEHICLE_CLASSES.camion_2_ejes, 200, NOW);
  const five = detectTolls(line, VEHICLE_CLASSES.tracto_semirremolque_5_ejes, 200, NOW);
  assert.equal(two.find((toll) => toll.plazaId === "r68_lo_prado")?.amountGross, 4800);
  assert.equal(five.find((toll) => toll.plazaId === "r68_lo_prado")?.amountGross, 8600);
  assert.match(two.find((toll) => toll.plazaId === "r68_lo_prado")?.sourceUrl ?? "", /RUTA-68\.pdf/);
  const sum = two.reduce((total, toll) => total + (toll.amountGross ?? 0), 0);
  assert.equal(sum, 4800);
});

test("Google Maps solo con clave; si no, OSRM", () => {
  const previous = process.env.ORS_API_KEY;
  delete process.env.ORS_API_KEY;
  assert.equal(chooseProvider({}).id, "osrm");
  assert.equal(chooseProvider({ googleKey: "presente-en-el-entorno" }).id, "google_maps");
  assert.equal(chooseProvider({ preferred: "osrm", googleKey: "presente-en-el-entorno" }).id, "osrm");
  if (previous === undefined) delete process.env.ORS_API_KEY;
  else process.env.ORS_API_KEY = previous;
  const encoded = encodePolyline(
    [
      [-70.4, -23.65],
      [-70.67, -33.45],
    ],
    5,
  );
  const routes = parseGoogleRoutesBody({
    routes: [
      {
        distanceMeters: 1_365_000,
        duration: "64800s",
        polyline: { encodedPolyline: encoded },
        legs: [{ steps: [{ distanceMeters: 1_365_000, navigationInstruction: { instructions: "Continúe por Ruta 5" } }] }],
      },
    ],
  });
  assert.equal(routes.provider, "google_maps");
  assert.equal(routes.distanceM, 1_365_000);
  assert.equal(routes.durationS, 64800);
  assert.equal(routes.geometry.length, 2);
  const directions = parseGoogleDirectionsBody({
    status: "OK",
    routes: [
      {
        overview_polyline: { points: encoded },
        legs: [{ distance: { value: 120_000 }, duration: { value: 7200 }, steps: [{ distance: { value: 120_000 }, html_instructions: "Tome la <b>Ruta 68</b>" }] }],
      },
    ],
  });
  assert.equal(directions.distanceM, 120_000);
  assert.equal(directions.durationS, 7200);
  assert.equal(directions.steps[0]?.motorway, true);
});
