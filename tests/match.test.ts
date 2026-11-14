import assert from "node:assert/strict";
import { test } from "node:test";
import { matchLoadToTruck } from "../src/lib/match";
import type { LoadCore, TruckCore } from "../src/lib/types";

function load(partial: Partial<LoadCore> = {}): LoadCore {
  return {
    equipment: "cama_baja",
    weightT: 30,
    origin: "Calama",
    destination: "Antofagasta",
    pickupDate: "2026-11-10",
    specs: { largoM: 10, anchoM: 3, ejesMin: 3, requiereRampas: true, requiereAcreditacion: true },
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

test("mismo corredor y fecha dentro de la ventana puntúa 100", () => {
  const result = matchLoadToTruck(load(), truck());
  assert.ok(result);
  assert.equal(result.score, 100);
  assert.ok(result.reasons.some((reason) => reason.includes("Mismo origen")));
  assert.ok(result.warnings.some((warning) => warning.includes("Ingreso con acreditación")));
});

test("rechaza otro equipo, menos toneladas o el corredor inverso", () => {
  assert.equal(matchLoadToTruck(load(), truck({ equipment: "rampla_plana" })), null);
  assert.equal(matchLoadToTruck(load(), truck({ tonnage: 29 })), null);
  assert.equal(matchLoadToTruck(load({ weightT: 40 }), truck({ tonnage: 40 }))?.score, 100);
  assert.equal(
    matchLoadToTruck(load(), truck({ origin: "Antofagasta", destination: "Calama" })),
    null,
  );
});

test("cama baja no calza si la carga es más ancha que la cama extensible", () => {
  assert.equal(matchLoadToTruck(load({ specs: { anchoM: 4, largoM: 10 } }), truck()), null);
});

test("refrigerado exige el rango y advierte sin resolución sanitaria", () => {
  const baseLoad = load({
    equipment: "refrigerado",
    weightT: 20,
    specs: { tempReq: 0, pallets: 10 },
  });
  const baseTruck = truck({
    equipment: "refrigerado",
    tonnage: 26,
    specs: { tempMin: -20, tempMax: 15, pallets: 24 },
  });
  const ok = matchLoadToTruck(baseLoad, baseTruck);
  assert.ok(ok);
  assert.ok(ok.reasons.some((reason) => reason.includes("Rango de frío")));
  assert.ok(ok.warnings.some((warning) => warning.includes("resolución sanitaria")));
  assert.equal(matchLoadToTruck(baseLoad, truck({ ...baseTruck, specs: { ...baseTruck.specs, resSanitaria: true } }))?.warnings.length, 0);
  assert.equal(matchLoadToTruck(load({ ...baseLoad, specs: { tempReq: 20 } }), baseTruck), null);
  assert.ok(matchLoadToTruck(load({ ...baseLoad, specs: { tempReq: -20 } }), baseTruck));
});

test("fechas a 2 días calzan con aviso y a 6 días no", () => {
  const near = matchLoadToTruck(load({ pickupDate: "2026-11-14" }), truck());
  assert.ok(near);
  assert.ok(near.warnings.some((warning) => warning.includes("2 día")));
  assert.equal(matchLoadToTruck(load({ pickupDate: "2026-11-18" }), truck()), null);
});

test("estanque, portacontenedor y carga peligrosa respetan ficha", () => {
  assert.equal(
    matchLoadToTruck(
      load({ equipment: "estanque", specs: { volumenM3: 20, producto: "Combustible", requiereBomba: true } }),
      truck({ equipment: "estanque", specs: { volumenM3: 30, producto: "Agua", bomba: true } }),
    ),
    null,
  );
  assert.ok(
    matchLoadToTruck(
      load({ equipment: "estanque", specs: { volumenM3: 20, producto: "Combustible" } }),
      truck({ equipment: "estanque", specs: { volumenM3: 30, producto: "Multiproducto" } }),
    ),
  );
  assert.equal(
    matchLoadToTruck(
      load({ equipment: "portacontenedor", specs: { tamano: "40'" } }),
      truck({ equipment: "portacontenedor", specs: { tamano: "20'" } }),
    ),
    null,
  );
  assert.ok(
    matchLoadToTruck(
      load({ equipment: "portacontenedor", specs: { tamano: "40'" } }),
      truck({ equipment: "portacontenedor", specs: { tamano: "20' y 40'" } }),
    ),
  );
  assert.equal(
    matchLoadToTruck(
      load({ equipment: "peligrosa", specs: { clase: 9 } }),
      truck({ equipment: "peligrosa", specs: { clases: "3, 8", autorizacion: true } }),
    ),
    null,
  );
  const hazard = matchLoadToTruck(
    load({ equipment: "peligrosa", specs: { clase: 8 } }),
    truck({ equipment: "peligrosa", specs: { clases: "3, 8" } }),
  );
  assert.ok(hazard);
  assert.ok(hazard.warnings.some((warning) => warning.includes("autorización")));
});

test("corredor de la misma región suma menos que la misma ciudad", () => {
  const regional = matchLoadToTruck(
    load({ origin: "Calama", destination: "Mejillones" }),
    truck({ origin: "Antofagasta", destination: "Mejillones" }),
  );
  assert.ok(regional);
  assert.equal(regional.score, 90);
  assert.ok(regional.reasons.some((reason) => reason.startsWith("Origen cercano")));
  assert.equal(
    matchLoadToTruck(load({ origin: "Santiago", destination: "Calama" }), truck({ origin: "Punta Arenas", destination: "Arica" })),
    null,
  );
});
