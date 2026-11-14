import assert from "node:assert/strict";
import { test } from "node:test";
import { CITIES, REGIONS, citiesInRegion, regionLabel, regionOfCity } from "../src/lib/catalog";
import { matchLoadToTruck } from "../src/lib/match";

test("las 16 regiones de Chile, de Arica y Parinacota a Magallanes", () => {
  assert.equal(REGIONS.length, 16);
  assert.equal(REGIONS[0].name, "Arica y Parinacota");
  assert.equal(REGIONS[15].name, "Magallanes y de la Antártica Chilena");
  assert.equal(new Set(REGIONS.map((region) => region.id)).size, 16);
});

test("cada región tiene ciudades y cada ciudad pertenece a una región", () => {
  for (const region of REGIONS) assert.ok(citiesInRegion(region.id).length > 0, region.name);
  for (const city of CITIES) assert.ok(regionOfCity(city.name), city.name);
  assert.equal(new Set(CITIES.map((city) => city.name)).size, CITIES.length);
  assert.equal(regionLabel(regionOfCity("Punta Arenas")), "Región de Magallanes");
  assert.equal(regionLabel(regionOfCity("Concepción")), "Región del Biobío");
});

test("ciudades nuevas del sur hacen match por región", () => {
  const result = matchLoadToTruck(
    {
      equipment: "rampla_plana",
      weightT: 20,
      origin: "Puerto Montt",
      destination: "Punta Arenas",
      pickupDate: "2026-11-10",
      specs: {},
    },
    {
      equipment: "rampla_plana",
      tonnage: 28,
      origin: "Puerto Varas",
      destination: "Punta Arenas",
      availableFrom: "2026-11-09",
      availableTo: "2026-11-12",
      specs: {},
    },
  );
  assert.ok(result);
});
