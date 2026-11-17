import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { blockingChecksFor, evaluateLoadTruck, MATCH_VERSION, matchLoadToTruck } from "../src/lib/match";
import type { LoadCore, TruckCore } from "../src/lib/types";

function load(partial: Partial<LoadCore> = {}): LoadCore {
  return {
    equipment: "cama_baja",
    weightT: 30,
    origin: "Calama",
    destination: "Antofagasta",
    pickupDate: "2026-11-10",
    specs: { largoM: 10, anchoM: 3, ejesMin: 3, requiereRampas: true },
    ...partial,
  };
}

function truck(partial: Partial<TruckCore> = {}): TruckCore {
  return {
    equipment: "cama_baja",
    tonnage: 40,
    origin: "Calama",
    destination: "Antofagasta",
    availableFrom: "2026-11-08",
    availableTo: "2026-11-12",
    specs: { ejes: 4, largoM: 13, anchoM: 3, anchoExtM: 3.6, rampas: true, winche: true },
    ...partial,
  };
}

test("evaluateLoadTruck no cambia el puntaje público y todo descarte tiene código", () => {
  const pairs: [LoadCore, TruckCore, string | null][] = [
    [load(), truck(), null],
    [load(), truck({ equipment: "rampla_plana" }), "EQUIPO"],
    [load(), truck({ tonnage: 29 }), "TONELAJE"],
    [load(), truck({ origin: "Antofagasta", destination: "Calama" }), "CORREDOR_INVERSO"],
    [load({ specs: { anchoM: 4, largoM: 10 } }), truck(), "ANCHO"],
    [load({ pickupDate: "2026-11-18" }), truck(), "FECHA"],
    [load({ origin: "Santiago", destination: "Calama" }), truck({ origin: "Punta Arenas", destination: "Arica" }), "CORREDOR"],
    [load({ equipment: "peligrosa", specs: { clase: 9 } }), truck({ equipment: "peligrosa", specs: { clases: "3, 8", autorizacion: true } }), "CLASE_PELIGRO"],
    [
      load({ equipment: "estanque", specs: { volumenM3: 20, producto: "Combustible", requiereBomba: true } }),
      truck({ equipment: "estanque", specs: { volumenM3: 30, producto: "Agua", bomba: true } }),
      "PRODUCTO",
    ],
  ];
  for (const [cargo, rig, code] of pairs) {
    const match = matchLoadToTruck(cargo, rig);
    const evaluation = evaluateLoadTruck(cargo, rig);
    assert.equal(evaluation.version, MATCH_VERSION);
    if (match) {
      assert.equal(evaluation.compatible, true);
      assert.equal(evaluation.reasonCode, null);
      assert.equal(evaluation.score, match.score);
      assert.deepEqual(evaluation.warnings, match.warnings);
    } else {
      assert.equal(evaluation.compatible, false);
      assert.equal(evaluation.reasonCode, code);
      assert.equal(evaluation.reasonCode === null, false);
    }
  }
});

test("peligrosa, refrigerada y minera bloquean solo si falta el requisito", () => {
  const cold = load({ equipment: "refrigerado", weightT: 20, specs: { tempReq: 0, pallets: 10 } });
  const coldTruck = truck({ equipment: "refrigerado", tonnage: 26, specs: { tempMin: -20, tempMax: 15, pallets: 24 } });
  const warned = evaluateLoadTruck(cold, coldTruck);
  assert.equal(warned.compatible, true);
  assert.equal(matchLoadToTruck(cold, coldTruck)?.warnings.some((warning) => warning.includes("resolución sanitaria")), true);
  assert.deepEqual(warned.blockingChecks.map((check) => check.code), ["CARGA_REFRIGERADA"]);
  assert.deepEqual(blockingChecksFor(cold, truck({ ...coldTruck, specs: { ...coldTruck.specs, resSanitaria: true } })), []);

  const hazard = load({ equipment: "peligrosa", specs: { clase: 8 } });
  const hazardTruck = truck({ equipment: "peligrosa", specs: { clases: "3, 8" } });
  assert.deepEqual(evaluateLoadTruck(hazard, hazardTruck).blockingChecks.map((check) => check.code), ["CARGA_PELIGROSA"]);
  assert.deepEqual(blockingChecksFor(hazard, truck({ ...hazardTruck, specs: { ...hazardTruck.specs, autorizacion: true } })), []);

  const mine = load({ equipment: "tolva", specs: { material: "Concentrados", volumenM3: 10 } });
  const mineTruck = truck({ equipment: "tolva", specs: { volumenM3: 30 } });
  assert.deepEqual(evaluateLoadTruck(mine, mineTruck).blockingChecks.map((check) => check.code), ["CARGA_MINERA"]);
  assert.deepEqual(blockingChecksFor(mine, truck({ ...mineTruck, specs: { ...mineTruck.specs, acreditacionMinera: true } })), []);
  assert.deepEqual(blockingChecksFor(load({ equipment: "tolva", specs: { material: "Áridos", volumenM3: 10 } }), mineTruck), []);
});

test("el listado público no usa evaluateLoadTruck", () => {
  const listings = fs.readFileSync(path.join(process.cwd(), "src/lib/listings.ts"), "utf8");
  assert.equal(listings.includes("evaluateLoadTruck"), false);
  assert.equal(listings.includes("MATCH_VERSION"), false);
  assert.match(listings, /matchTrucksForLoad/);
});
