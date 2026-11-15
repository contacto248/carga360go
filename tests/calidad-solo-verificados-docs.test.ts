import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { setUserVerification } from "../src/lib/auth";
import { addDocument, setDocumentVerification } from "../src/lib/documents";
import { createLoad, createTruck, getLoad } from "../src/lib/listings";
import { publicVerifiedSeal } from "../src/lib/public-trust";
import { addDays, person } from "./helpers-agente";

test("T-008 residual: soloVerificados exige sello Verificado (status + ownerDocsOk) en el matching", () => {
  const mandante = person("mandante", "t008r-m");
  // Transportista sin documentos verificados: verification_status se fuerza a verificado, docs quedan vacíos.
  const carrier = person("transportista", "t008r-c", { verified: false });
  setUserVerification(carrier.user.id, "verificado", null);

  const truck = createTruck(carrier.user, {
    origin: "Copiapó",
    destination: "La Serena",
    availableFrom: addDays(0),
    availableTo: addDays(10),
    equipment: "rampla_plana",
    tonnage: 20,
    specs: { largoM: 12 },
  });

  const load = createLoad(mandante.user, {
    origin: "Copiapó",
    destination: "La Serena",
    pickupDate: addDays(3),
    equipment: "rampla_plana",
    description: "Carga solo verificados — residual T-008",
    weightT: 10,
    specs: { largoM: 12 },
    soloVerificados: true,
  });

  const listed = getLoad(load.id);
  assert.ok(listed);
  assert.equal(listed!.soloVerificados, true);
  const truckListed = listed!.matches.find((m) => m.truck.id === truck.id);
  assert.equal(truckListed, undefined, "sin docs al día no debe entrar al match de soloVerificados");

  const padron = addDocument(carrier.user, {
    type: "padron",
    expiry: addDays(400),
    truckId: truck.id,
  });
  setDocumentVerification(padron.id, "verificado", null);

  const after = getLoad(load.id);
  assert.ok(after);
  const hit = after!.matches.find((m) => m.truck.id === truck.id);
  assert.ok(hit, "con documento verificado y vigente debe calzar");
  assert.equal(publicVerifiedSeal("verificado", true), true);
});
